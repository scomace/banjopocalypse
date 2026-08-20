// NetworkInputSource: delay-based lockstep through the InputSource seam.
// Each tick the local keyboard is sampled ONCE, scheduled `delay` ticks in
// the future, and sent to the peer; poll(T) only releases the sim when every
// player's command for T is in hand — otherwise the sim stalls and waits.
// Both machines therefore run the exact same (seed, input stream) and stay
// bit-identical, which the periodic hash exchange loudly verifies.
//
// Levels restart sim.tick at 0, so every message carries a level sequence
// number (`seq`, bumped identically on both clients at every buildSim). A
// peer that reaches the next level first has its early messages stashed and
// adopted when we get there; stale ones from a finished level are dropped.

import type { InputSampler } from "../core/input";
import type { InputSource } from "../core/inputsource";
import type { SimInputs } from "../sim/types";
import type { NetMsg, RoomClient } from "./client";

const HASH_KEEP = 40; // exchanged hashes retained (1 per 60 ticks = ~40s)

export class NetworkInputSource implements InputSource {
  private seq = 0;
  private bufs: Map<number, number>[];
  private lastSampled = -1;
  private pending: NetMsg[] = [];
  private localHashes = new Map<number, number>();
  private remoteHashes = new Map<number, number>();
  /** first tick where local and remote state hashes disagreed, else null */
  desyncAt: number | null = null;
  onDesync: (tick: number) => void = () => {};
  private unsub: () => void;

  constructor(
    private client: RoomClient,
    private sampler: InputSampler,
    readonly myIdx: number,
    readonly delay: number,
    playerCount = 2,
  ) {
    this.bufs = Array.from({ length: playerCount }, () => new Map<number, number>());
    this.unsub = client.on((m) => this.onMessage(m));
  }

  private onMessage(m: NetMsg): void {
    if (m.t !== "input" && m.t !== "hash") return;
    const seq = (m.seq as number) ?? 0;
    if (seq === this.seq) this.apply(m);
    else if (seq > this.seq) this.pending.push(m); // peer is a level ahead
    // seq < this.seq: leftovers from a finished level, drop
  }

  private apply(m: NetMsg): void {
    if (m.t === "input" && typeof m.from === "number" && this.bufs[m.from]) {
      this.bufs[m.from].set(m.tick as number, m.cmd as number);
    } else if (m.t === "hash" && typeof m.tick === "number") {
      this.remoteHashes.set(m.tick, m.hash as number);
      this.compareHashes(m.tick);
    }
  }

  /** Call on every sim swap (next level, continue), with a counter bumped
   *  identically on both clients. Resets tick-keyed state and adopts any
   *  messages the faster peer already sent for this level. */
  newLevel(seq: number): void {
    this.seq = seq;
    this.lastSampled = -1;
    for (const b of this.bufs) b.clear();
    this.localHashes.clear();
    this.remoteHashes.clear();
    const adopt = this.pending.filter((m) => m.seq === seq);
    this.pending = this.pending.filter((m) => (m.seq as number) > seq);
    for (const m of adopt) this.apply(m);
  }

  poll(tick: number): SimInputs | null {
    // sample-and-send exactly once per tick, even while stalled on this tick
    if (tick > this.lastSampled) {
      this.lastSampled = tick;
      const cmd = this.sampler.sample(0);
      const target = tick + this.delay;
      this.bufs[this.myIdx].set(target, cmd);
      this.client.send({ t: "input", seq: this.seq, tick: target, cmd });
    }
    const out: number[] = [];
    for (const buf of this.bufs) {
      const cmd = buf.get(tick) ?? (tick < this.delay ? 0 : undefined);
      if (cmd === undefined) return null; // stall: peer's tick not here yet
      out.push(cmd);
    }
    if (tick % 300 === 0) this.prune(tick);
    return out;
  }

  /** Call after stepping with hashSim(sim) every N ticks; exchanged and
   *  compared both ways so a desync screams on both machines. */
  reportLocalHash(tick: number, hash: number): void {
    this.localHashes.set(tick, hash);
    this.client.send({ t: "hash", seq: this.seq, tick, hash });
    this.compareHashes(tick);
  }

  /** QA: the local hash recorded at an exchanged tick of the current level. */
  hashAt(tick: number): number | undefined {
    return this.localHashes.get(tick);
  }

  private compareHashes(tick: number): void {
    const a = this.localHashes.get(tick);
    const b = this.remoteHashes.get(tick);
    if (a === undefined || b === undefined) return;
    if (a !== b && this.desyncAt === null) {
      this.desyncAt = tick;
      this.onDesync(tick);
    }
  }

  private prune(tick: number): void {
    for (const buf of this.bufs) {
      for (const k of buf.keys()) if (k < tick - 60) buf.delete(k);
    }
    for (const m of [this.localHashes, this.remoteHashes]) {
      if (m.size > HASH_KEEP) {
        const keys = [...m.keys()].sort((x, y) => x - y);
        for (const k of keys.slice(0, keys.length - HASH_KEEP)) m.delete(k);
      }
    }
  }

  destroy(): void {
    this.unsub();
  }
}
