// RoomClient: the browser side of the room server protocol (server/).
// Thin on purpose — connect, hand back the welcome (slot, seed, code),
// relay JSON messages, measure RTT. Wall-clock time is fine HERE (it never
// touches the sim); the sim only ever sees the tick-stamped input stream.

export type NetMsg = { t: string; from?: number } & Record<string, unknown>;

export type Welcome = {
  t: "welcome";
  code: string;
  idx: number;
  seed: number;
  cap: number;
  peers: number[];
};

const DEFAULT_NET = "https://banjopocalypse-net.scomace.workers.dev";

/** Server base as a ws(s) URL; override with ?net=http://127.0.0.1:8787 */
export function netBase(): string {
  const q = new URLSearchParams(window.location.search).get("net");
  return (q ?? DEFAULT_NET).replace(/^http/, "ws").replace(/\/$/, "");
}

const KEEPALIVE_MS = 25_000;

export class RoomClient {
  readonly welcome: Welcome;
  private ws!: WebSocket;
  private handlers = new Set<(m: NetMsg) => void>();
  private keepalive = 0;
  /** Fires when the socket drops for any reason (server gone, network cut). */
  onClosed: (reason: string) => void = () => {};

  private constructor(ws: WebSocket, welcome: Welcome) {
    this.welcome = welcome;
    this.attach(ws);
  }

  /** Wire up a (possibly fresh) socket: message fanout, close, keepalive. */
  private attach(ws: WebSocket): void {
    window.clearInterval(this.keepalive);
    this.ws = ws;
    ws.addEventListener("message", (e) => {
      let msg: NetMsg;
      try {
        msg = JSON.parse(e.data as string) as NetMsg;
      } catch {
        return;
      }
      if (msg.t === "keepalive") return;
      for (const h of this.handlers) h(msg);
    });
    ws.addEventListener("close", (e) => {
      if (this.ws !== ws) return; // an old socket we already replaced
      window.clearInterval(this.keepalive);
      this.onClosed(e.reason || "connection lost");
    });
    this.keepalive = window.setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('{"t":"keepalive"}');
    }, KEEPALIVE_MS);
  }

  static async host(): Promise<RoomClient> {
    const { ws, welcome } = await RoomClient.connect(`${netBase()}/ws/new`);
    return new RoomClient(ws, welcome);
  }

  static async join(code: string): Promise<RoomClient> {
    const { ws, welcome } = await RoomClient.connect(`${netBase()}/ws/join/${code.toUpperCase()}`);
    return new RoomClient(ws, welcome);
  }

  /** Rejoin the same room in place after a drop: same code, same slot, all
   *  subscribers intact. Throws if the room is gone or our slot got taken. */
  async reconnect(): Promise<void> {
    const { ws, welcome } = await RoomClient.connect(
      `${netBase()}/ws/join/${this.welcome.code}`,
    );
    if (welcome.idx !== this.welcome.idx) {
      ws.close();
      throw new Error("our slot got taken");
    }
    this.attach(ws);
  }

  /** QA only: yank the socket so the reconnect path can be exercised. */
  debugDropSocket(): void {
    this.ws.close();
  }

  private static connect(url: string): Promise<{ ws: WebSocket; welcome: Welcome }> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const fail = (why: string) => reject(new Error(why));
      const onFirst = (e: MessageEvent) => {
        try {
          const msg = JSON.parse(e.data as string) as Welcome;
          if (msg.t === "welcome") {
            ws.removeEventListener("message", onFirst);
            resolve({ ws, welcome: msg });
            return;
          }
        } catch {
          /* fall through to failure */
        }
        ws.close();
        fail("bad handshake");
      };
      ws.addEventListener("message", onFirst);
      ws.addEventListener("close", (e) => {
        if (e.code === 4404) fail("no room with that code");
        else if (e.code === 4409) fail("that room is full");
        else fail(e.reason || "could not reach the room server");
      });
      ws.addEventListener("error", () => fail("could not reach the room server"));
    });
  }

  send(msg: NetMsg): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Subscribe to room messages; returns the unsubscribe. */
  on(handler: (m: NetMsg) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** Median round-trip in ms over a few pings. */
  async rtt(samples = 4): Promise<number> {
    const times: number[] = [];
    for (let i = 0; i < samples; i++) {
      const n = Math.floor(Math.random() * 1e9);
      const sent = Date.now();
      const got = new Promise<void>((resolve) => {
        const un = this.on((m) => {
          if (m.t === "pong" && m.n === n) {
            un();
            resolve();
          }
        });
        setTimeout(() => {
          un();
          resolve(); // a lost pong counts as a slow sample below
        }, 2000);
      });
      this.send({ t: "ping", n });
      await got;
      times.push(Date.now() - sent);
    }
    times.sort((a, b) => a - b);
    return times[Math.floor(times.length / 2)];
  }

  close(): void {
    window.clearInterval(this.keepalive);
    this.onClosed = () => {};
    this.ws.close();
  }
}

/** Everything the game needs to run an online session. */
export type NetSession = {
  client: RoomClient;
  myIdx: number;
  /** lockstep input delay in ticks, agreed by the host from measured RTT */
  delay: number;
  castIds: (string | null)[];
};

/** Input delay from a measured round trip: half the RTT in ticks, plus one
 *  for jitter, clamped to a feelable range (2 ticks = 33ms, 8 = 133ms). */
export function delayForRtt(rttMs: number): number {
  return Math.max(2, Math.min(8, Math.ceil(rttMs / 2 / 16.7) + 1));
}
