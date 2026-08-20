// BANJOPOCALYPSE room server. One Durable Object per room (getByName(code)),
// WebSockets on the hibernation API so idle rooms cost nothing. The relay is
// deliberately dumb: it assigns player slots, hands out the shared seed, and
// forwards every game message verbatim (stamped with `from`) — all game
// rules live in the deterministic client sim. Bandwidth is a bitfield per
// player per tick, so JSON text frames are plenty.
//
//   GET /ws/new[?cap=2..4]   create a room -> welcome carries the code
//   GET /ws/join/:code       join an existing room
//   GET /health              liveness probe
//
// Close codes: 4404 no such room, 4409 room full (or code collision).

import { DurableObject } from "cloudflare:workers";

export interface Env {
  ROOM: DurableObjectNamespace<RoomDO>;
}

/** Room codes: 4 letters, no lookalikes (I/L/O/U out). 22^4 = 234k rooms. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LEN = 4;
const MAX_CAP = 4;
const DEFAULT_CAP = 2;
/** Idle rooms are wiped by alarm this long after creation (refreshed while occupied). */
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
/** An emptied room lingers this long so a dropped pair can both wander back. */
const EMPTY_GRACE_MS = 2 * 60 * 1000;
const MAX_MSG_BYTES = 2048;

function randomCode(): string {
  const buf = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(buf);
  let code = "";
  for (const b of buf) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return code;
}

type RoomMeta = { code: string; seed: number; cap: number };
type Attachment = { idx: number };

export class RoomDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // keepalive pings answered without waking the object
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('{"t":"keepalive"}', '{"t":"keepalive"}'),
    );
  }

  /** Worker-side probe so /ws/new can skip occupied codes. */
  async occupancy(): Promise<"empty" | "open" | "full"> {
    const meta = await this.ctx.storage.get<RoomMeta>("room");
    if (!meta) return "empty";
    const n = this.ctx.getWebSockets().length;
    return n >= meta.cap ? "full" : "open";
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const url = new URL(request.url);
    const code = url.searchParams.get("code") ?? "????";
    const creating = url.searchParams.get("create") === "1";

    let meta = await this.ctx.storage.get<RoomMeta>("room");
    if (creating) {
      if (meta && this.ctx.getWebSockets().length > 0) {
        return this.reject(4409, "code collision, try again");
      }
      const cap = Math.min(MAX_CAP, Math.max(2, Number(url.searchParams.get("cap")) || DEFAULT_CAP));
      meta = { code, seed: crypto.getRandomValues(new Uint32Array(1))[0], cap };
      await this.ctx.storage.put("room", meta);
      await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
    } else {
      if (!meta) return this.reject(4404, "no such room");
      if (this.ctx.getWebSockets().length >= meta.cap) return this.reject(4409, "room full");
    }

    // first free player slot (host is 0; a leaver's slot is reusable)
    const taken = new Set(
      this.ctx.getWebSockets().map((w) => (w.deserializeAttachment() as Attachment).idx),
    );
    let idx = 0;
    while (taken.has(idx)) idx++;

    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ idx } satisfies Attachment);
    pair[1].send(
      JSON.stringify({ t: "welcome", code: meta.code, idx, seed: meta.seed, cap: meta.cap, peers: [...taken] }),
    );
    this.broadcast(JSON.stringify({ t: "peer", event: "join", idx }), pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string" || message.length > MAX_MSG_BYTES) return;
    const from = (ws.deserializeAttachment() as Attachment).idx;
    // latency probe: answer the sender directly, don't relay
    if (message.startsWith('{"t":"ping"')) {
      try {
        const m = JSON.parse(message) as { t: string; n?: number };
        if (m.t === "ping") {
          ws.send(JSON.stringify({ t: "pong", n: m.n ?? 0 }));
          return;
        }
      } catch {
        return;
      }
    }
    // everything else relays verbatim, stamped with the sender's slot
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(message) as Record<string, unknown>;
    } catch {
      return;
    }
    parsed.from = from;
    this.broadcast(JSON.stringify(parsed), ws);
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    // echo the close back or a client-initiated close hangs in CLOSING forever.
    // 1005/1006/1015 are reserved "no status" codes — sending them throws.
    const echoCode = code === 1005 || code === 1006 || code === 1015 ? 1000 : code;
    try {
      ws.close(echoCode, (reason || "bye").slice(0, 100));
    } catch {
      // already fully closed
    }
    const att = ws.deserializeAttachment() as Attachment | null;
    const others = this.ctx.getWebSockets().filter((w) => w !== ws);
    if (att) {
      for (const w of others) {
        w.send(JSON.stringify({ t: "peer", event: "leave", idx: att.idx }));
      }
    }
    // don't wipe immediately: a briefly-offline pair may both reconnect
    if (others.length === 0) await this.ctx.storage.setAlarm(Date.now() + EMPTY_GRACE_MS);
  }

  /** TTL sweep: wipe the room unless someone is still connected. */
  async alarm(): Promise<void> {
    if (this.ctx.getWebSockets().length === 0) {
      await this.ctx.storage.deleteAll();
    } else {
      await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
    }
  }

  private broadcast(payload: string, except?: WebSocket): void {
    for (const w of this.ctx.getWebSockets()) {
      if (w === except) continue;
      try {
        w.send(payload);
      } catch {
        // a socket mid-close is not our problem; close events handle it
      }
    }
  }

  /** Refuse politely: accept, close with a code the client can read. */
  private reject(code: number, reason: string): Response {
    const pair = new WebSocketPair();
    pair[1].accept();
    pair[1].close(code, reason);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response("ok");

    if (url.pathname === "/ws/new") {
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomCode();
        const stub = env.ROOM.getByName(code);
        if ((await stub.occupancy()) !== "empty") continue;
        const fwd = new URL(url);
        fwd.searchParams.set("create", "1");
        fwd.searchParams.set("code", code);
        return stub.fetch(new Request(fwd, request));
      }
      return new Response("no free room codes, try again", { status: 503 });
    }

    const join = url.pathname.match(/^\/ws\/join\/([A-Za-z]{4})$/);
    if (join) {
      const code = join[1].toUpperCase();
      const stub = env.ROOM.getByName(code);
      const fwd = new URL(url);
      fwd.searchParams.set("code", code);
      return stub.fetch(new Request(fwd, request));
    }

    return new Response("not found", { status: 404 });
  },
};
