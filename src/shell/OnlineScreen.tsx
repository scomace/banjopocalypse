// Online lobby: host or join a room on banjopocalypse-net, pick kinfolk,
// launch a lockstep session. The room's seed becomes the run seed on both
// machines; the host measures RTT and dictates the input delay. Deep link:
// ?room=CODE joins straight from the title. QA autopilot: ?online=host /
// ?online=join&room=CODE (+&cast=) drives the lobby hands-free.

import { useEffect, useRef, useState } from "react";
import { CAST, castUnlocked } from "../game/cast";
import { loadSave } from "../game/core/save";
import { audio } from "../game/audio/engine";
import { delayForRtt, RoomClient, type NetMsg, type NetSession } from "../game/net/client";
import { CastCard, Marquee, MenuButton } from "./screens";

const P_COLORS = ["#9be8c8", "#f0c880"];

type Lobby = {
  client: RoomClient;
  myIdx: number;
  code: string;
  seed: number;
  peers: number[];
  casts: (string | null)[];
};

export function OnlineScreen({
  onStart,
  onBack,
  initialCode,
  auto,
  autoCast,
}: {
  onStart: (session: NetSession, seed: number) => void;
  onBack: () => void;
  initialCode?: string;
  auto?: "host" | "join" | null;
  autoCast?: string;
}) {
  const save = useRef(loadSave()).current;
  const lobbyRef = useRef<Lobby | null>(null);
  const started = useRef(false);
  const inited = useRef(false);
  const [, bump] = useState(0);
  const rerender = () => bump((v) => v + 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [joinCode, setJoinCode] = useState(initialCode ?? "");
  const [copied, setCopied] = useState(false);

  const enterLobby = (client: RoomClient) => {
    const w = client.welcome;
    lobbyRef.current = {
      client,
      myIdx: w.idx,
      code: w.code,
      seed: w.seed,
      peers: [...new Set([...w.peers, w.idx])].sort(),
      casts: [null, null],
    };
    client.onClosed = (reason) => {
      if (started.current) return;
      lobbyRef.current = null;
      setError(reason);
      rerender();
    };
    setBusy(false);
    rerender();
  };

  const host = async () => {
    setBusy(true);
    setError("");
    try {
      enterLobby(await RoomClient.host());
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const join = async (code: string) => {
    if (!/^[A-Za-z]{4}$/.test(code)) {
      setError("room codes are 4 letters");
      return;
    }
    setBusy(true);
    setError("");
    try {
      enterLobby(await RoomClient.join(code));
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const pickCast = (castId: string) => {
    const l = lobbyRef.current;
    if (!l) return;
    l.casts[l.myIdx] = castId;
    l.client.send({ t: "lobby", castId });
    audio.playSfx("letter", 1);
    rerender();
  };

  const startGame = async () => {
    const l = lobbyRef.current;
    if (!l || started.current || l.myIdx !== 0) return;
    if (l.peers.length < 2 || !l.casts[0] || !l.casts[1]) return;
    started.current = true;
    rerender();
    const rtt = await l.client.rtt();
    const delay = delayForRtt(rtt);
    const castIds = [l.casts[0], l.casts[1]];
    l.client.send({ t: "start", castIds, delay });
    onStart({ client: l.client, myIdx: l.myIdx, delay, castIds }, l.seed);
  };

  // deep link / autopilot connect (ref-guarded: StrictMode double-mounts)
  useEffect(() => {
    if (inited.current) return;
    inited.current = true;
    if (auto === "host") void host();
    else if (initialCode) void join(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // lobby message wiring
  useEffect(() => {
    const l = lobbyRef.current;
    if (!l) return;
    const un = l.client.on((m: NetMsg) => {
      if (m.t === "peer" && m.event === "join") {
        l.peers = [...new Set([...l.peers, m.idx as number])].sort();
        // the newcomer needs to hear my pick
        if (l.casts[l.myIdx]) l.client.send({ t: "lobby", castId: l.casts[l.myIdx] });
        rerender();
      } else if (m.t === "peer" && m.event === "leave") {
        l.peers = l.peers.filter((p) => p !== m.idx);
        l.casts[m.idx as number] = null;
        rerender();
      } else if (m.t === "lobby" && typeof m.from === "number") {
        l.casts[m.from] = m.castId as string;
        rerender();
      } else if (m.t === "start" && !started.current) {
        started.current = true;
        onStart(
          {
            client: l.client,
            myIdx: l.myIdx,
            delay: m.delay as number,
            castIds: m.castIds as (string | null)[],
          },
          l.seed,
        );
      }
    });
    return un;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyRef.current]);

  // QA autopilot: pick a cast, host starts once everyone's in
  useEffect(() => {
    if (!auto) return;
    const iv = setInterval(() => {
      const l = lobbyRef.current;
      if (!l || started.current) return;
      if (!l.casts[l.myIdx]) pickCast(autoCast ?? (l.myIdx === 0 ? "earl" : "buford"));
      if (auto === "host") void startGame();
    }, 300);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  const l = lobbyRef.current;
  // QA observability
  (window as unknown as { __lobby?: unknown }).__lobby = l
    ? { code: l.code, peers: l.peers.length, casts: l.casts, started: started.current }
    : null;

  if (!l) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-5">
        <Marquee size="text-5xl" />
        <div className="font-pixel text-[10px] text-white/60">TWO HOLLERS, ONE STILL</div>
        {busy ? (
          <div className="font-pixel text-[10px] text-white/70">reachin' across the county line...</div>
        ) : (
          <>
            <MenuButton onClick={() => void host()}>Host a Room</MenuButton>
            <div className="flex items-center gap-2">
              <input
                className="w-28 border-2 border-[#5a4a30] bg-black/60 px-2 py-1 text-center font-display text-2xl uppercase tracking-widest text-white outline-none focus:border-[#E8B928]"
                maxLength={4}
                placeholder="CODE"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void join(joinCode);
                  e.stopPropagation();
                }}
              />
              <MenuButton onClick={() => void join(joinCode)}>Join</MenuButton>
            </div>
          </>
        )}
        {error && <div className="font-pixel text-[9px] text-[#ff7a5c]">{error.toUpperCase()}</div>}
        <MenuButton subtle onClick={onBack}>
          BACK
        </MenuButton>
      </div>
    );
  }

  const link = (() => {
    const u = new URL(window.location.href);
    u.search = "";
    const net = new URLSearchParams(window.location.search).get("net");
    u.searchParams.set("room", l.code);
    if (net) u.searchParams.set("net", net);
    return u.toString();
  })();
  const ready = l.peers.length >= 2 && !!l.casts[0] && !!l.casts[1];

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 overflow-auto py-6">
      <div className="font-pixel text-[9px] text-white/50">ROOM CODE</div>
      <div
        className="font-display text-6xl uppercase tracking-[0.3em] text-[#E8B928]"
        style={{ textShadow: "3px 3px 0 #000" }}
      >
        {l.code}
      </div>
      <button
        className="font-pixel text-[8px] text-white/40 hover:text-white"
        onClick={() => {
          void navigator.clipboard?.writeText(link).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? "COPIED!" : "COPY INVITE LINK"}
      </button>
      <div className="flex gap-8">
        {[0, 1].map((pi) => (
          <div key={pi} className="text-center">
            <div className="font-pixel text-[10px]" style={{ color: P_COLORS[pi] }}>
              P{pi + 1}
              {pi === l.myIdx ? " (YOU)" : ""}
            </div>
            <div className="font-display text-xl uppercase text-white">
              {!l.peers.includes(pi)
                ? "· · ·"
                : l.casts[pi]
                  ? CAST.find((c) => c.id === l.casts[pi])?.displayName
                  : "pickin'..."}
            </div>
          </div>
        ))}
      </div>
      <div className="font-pixel text-[9px] text-white/50">
        {l.peers.length < 2 ? "WAITIN' ON YER PARTNER — SEND 'EM THE CODE" : "PICK YER KINFOLK"}
      </div>
      <div className="grid max-w-4xl grid-cols-4 gap-3">
        {CAST.map((m) => (
          <CastCard
            key={m.id}
            member={m}
            locked={!castUnlocked(m, save)}
            rescued={save.castRescued.includes(m.id)}
            selected={l.casts.map((c, i) => (c === m.id ? i : -1)).filter((i) => i >= 0)}
            onPick={() => pickCast(m.id)}
          />
        ))}
      </div>
      <div className="flex items-center gap-4">
        {l.myIdx === 0 ? (
          <MenuButton onClick={() => void startGame()}>
            {ready ? "Let's Go" : "Waitin'..."}
          </MenuButton>
        ) : (
          <div className="font-pixel text-[9px] text-white/50">THE HOST KICKS IT OFF</div>
        )}
        <MenuButton
          subtle
          onClick={() => {
            l.client.close();
            lobbyRef.current = null;
            onBack();
          }}
        >
          LEAVE
        </MenuButton>
      </div>
    </div>
  );
}
