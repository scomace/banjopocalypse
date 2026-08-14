// Zero-latency synthesized SFX via Web Audio. A sound is a plain-JSON
// SynthSpec, so the sound lab (/admin/spum?tab=sounds) can audition/tweak
// presets and export the chosen spec straight into content or code.
//
// Spec kinds:
//   chime   — a sequence of decaying notes (success dings, arps, fanfares)
//   sweep   — pitch-swept tone with optional repeats/vibrato/distortion
//             (failure buzzers, womps, sad trombones, rising chirps)
//   buzz    — modulated tone that loops until stopped, optionally gated into
//             bursts so it starts and stops like a real insect (flies)
//   noise   — shaped noise bed + sparse crackle impulses (wind, rain, fire,
//             thunder, static); loops until stopped when duration is 0
//   modal   — a strike exciting a bank of decaying inharmonic partials
//             (bells, struck metal, wood knocks)
//   pulse   — another spec re-fired at a rate that ramps over time, rising in
//             pitch and level as it goes (ticking/beeping countdowns)
//   seq     — other specs fired at fixed offsets (multi-hit combos)
//
// Every spec also takes an optional `reverb` (0–1): a send into one shared
// ConvolverNode whose impulse response is generated noise — space and
// distance without any audio asset.

export type Wave = "sine" | "square" | "sawtooth" | "triangle";

export type ChimeSpec = {
  kind: "chime";
  wave: Wave;
  /** Hz of the first note; other notes are semitone offsets from it. */
  baseFreq: number;
  /** Semitone offsets played in order (0 = baseFreq, 12 = octave up). */
  notes: number[];
  /** Seconds between note starts (0 = a chord). */
  noteGap: number;
  /** Seconds each note takes to decay to silence. */
  noteDur: number;
  /** Cents of a quieter shimmer layer per note (0 = off). */
  detune: number;
  /** 0–1 send into the shared generated-IR reverb (absent = dry). */
  reverb?: number;
  volume: number;
  lowpass: number;
};

export type SweepSpec = {
  kind: "sweep";
  wave: Wave;
  startFreq: number;
  endFreq: number;
  /** Seconds per repeat. */
  duration: number;
  repeats: number;
  /** Seconds of silence between repeats. */
  repeatGap: number;
  /** Semitones each successive repeat shifts down (sad trombone). */
  repeatDrop: number;
  vibratoRate: number;
  /** Hz of pitch wobble (0 = off). */
  vibratoDepth: number;
  /** 0–1 waveshaper drive (harsh buzzer grit). */
  distortion: number;
  /** 0–1 send into the shared generated-IR reverb (absent = dry). */
  reverb?: number;
  volume: number;
  lowpass: number;
};

export type BuzzSpec = {
  kind: "buzz";
  wave: Wave;
  baseFreq: number;
  /** Hz rate of the pitch wobble that makes it read as an insect. */
  wobbleRate: number;
  /** Hz of pitch deviation. */
  wobbleDepth: number;
  /** Hz rate of amplitude flutter. */
  tremRate: number;
  /** 0–1 amplitude flutter depth. */
  tremDepth: number;
  /** 1–3 detuned oscillator layers (2+ sounds like wings/swarm). */
  layers: number;
  /** Cents between layers. */
  layerDetune: number;
  /** Hz of left↔right pan drift (0 = centered). */
  panRate: number;
  /**
   * Seconds of audible burst per cycle. 0 = continuous drone; anything above
   * gates the buzz on/off forever so it reads as a fly flying, pausing, and
   * setting off again rather than an unbroken tone.
   */
  burstOn: number;
  /** Seconds of silence between bursts (ignored when burstOn is 0). */
  burstOff: number;
  /** Seconds of fade at each burst edge — longer is gentler/breathier. */
  burstFade: number;
  /** 0–1 send into the shared generated-IR reverb (absent = dry). */
  reverb?: number;
  volume: number;
  lowpass: number;
};

/** One note (or chord) in a tune voice. Times are in beats, not seconds. */
export type TuneNote = {
  /** Beat offset from the start of the tune. */
  at: number;
  /** Semitone offset(s) from the tune root — an array plays as a chord. */
  n: number | number[];
  /** Length in beats. */
  d: number;
  /** 0–1 velocity (default 1). */
  v?: number;
};

export type TuneVoice = {
  wave: Wave;
  /** Whole-octave shift applied to every note in this voice. */
  octave?: number;
  /** Cents of a quieter detuned layer (0/absent = off). */
  detune?: number;
  volume: number;
  /** Seconds to reach full level. */
  attack: number;
  /** 0–1 level the note decays to across its length (low = plucky). */
  sustain: number;
  /** Seconds of tail after the note ends. */
  release: number;
  notes: TuneNote[];
};

export type DrumType =
  | "kick"
  | "snare"
  | "hat"
  | "clap"
  | "crash"
  | "roll"
  | "applause";

export type DrumHit = { at: number; type: DrumType; v?: number };

/** A short multi-voice piece of music — level-complete jingles and fanfares. */
export type TuneSpec = {
  kind: "tune";
  bpm: number;
  /** Hz of semitone 0. Moving this transposes the whole piece. */
  root: number;
  voices: TuneVoice[];
  drums: DrumHit[];
  /** 0–1 dotted-eighth echo send. */
  echo: number;
  /** 0–1 send into the shared generated-IR reverb (absent = dry). */
  reverb?: number;
  volume: number;
  lowpass: number;
};

/**
 * Breaking glass: an impact crack followed by scattered shards ringing out.
 * Shard pitches and timings come from `seed`, so a given spec always breaks
 * exactly the same way — reroll the seed for a different break.
 */
export type ShatterSpec = {
  kind: "shatter";
  /** 0–1 level of the initial crack. */
  impact: number;
  /** Hz highpass on the crack — higher is thinner and glassier. */
  impactTone: number;
  /** Seconds the crack decays over. */
  impactDecay: number;
  /** How many shards ring out after the crack. */
  shards: number;
  /** Seconds over which shards scatter (the length of the tinkling tail). */
  spread: number;
  /** Hz range shard pitches are drawn from. */
  shardLow: number;
  shardHigh: number;
  /** Seconds each shard rings for. */
  shardDecay: number;
  /** 0–1 — how tightly shards bunch up right after the impact. */
  clump: number;
  /** 0–1 low thud under the break (heavy plate glass, window frame). */
  body: number;
  /** Deterministic RNG seed. */
  seed: number;
  /** 0–1 send into the shared generated-IR reverb (absent = dry). */
  reverb?: number;
  volume: number;
};

/**
 * Shaped noise: a filtered noise bed whose filter slowly wanders (wind that
 * gusts rather than hisses) plus an optional stream of sparse crackle
 * impulses (fire pops, rain ticks, geiger clicks). The crackle pattern is
 * baked into a looping buffer, so it runs forever with no JS scheduler and a
 * given spec always crackles the same way.
 */
export type NoiseSpec = {
  kind: "noise";
  /** Filter that shapes the noise bed. */
  filterType: "lowpass" | "bandpass" | "highpass";
  filterFreq: number;
  filterQ: number;
  /** Hz rate of the slow filter-frequency wander (0 = static). */
  driftRate: number;
  /** Hz the filter wanders by. */
  driftDepth: number;
  /** Hz rate of amplitude swell (gusts, wave sets). */
  swellRate: number;
  /** 0–1 swell depth. */
  swellDepth: number;
  /** 0–1 level of the noise bed (0 = crackle only). */
  bedLevel: number;
  /** Average crackle impulses per second (0 = off). */
  crackleRate: number;
  /** Hz highpass on the crackles — high ticks vs. low glubs. */
  crackleTone: number;
  /** 0–1 crackle level relative to the bed. */
  crackleLevel: number;
  /** Seconds of fade-in. */
  attack: number;
  /** Seconds the sound holds; 0 = loop until stopped. */
  duration: number;
  /** Seconds of fade-out after `duration` (ignored when looping). */
  release: number;
  /** Hz of left↔right pan drift (0 = centered). */
  panRate: number;
  /** 0–1 send into the shared generated-IR reverb (absent = dry). */
  reverb?: number;
  volume: number;
  lowpass: number;
};

/** One resonant partial of a modal impact. */
export type ModalMode = {
  /** Hz. */
  f: number;
  /** Seconds to decay to silence. */
  d: number;
  /** 0–1 level. */
  a: number;
};

/**
 * Modal impact: a short noise strike plus a bank of decaying sine partials.
 * Real struck objects are exactly this — inharmonic partials with different
 * decay rates — so a handful of measured-ish modes reads as actual metal,
 * bell bronze, or wood in a way tuned chords never do.
 */
export type ModalSpec = {
  kind: "modal";
  modes: ModalMode[];
  /** Cents of a quieter detuned layer per partial — big-bell beating. */
  shimmer: number;
  /** Seconds of the noise strike that "hits" the object. */
  strike: number;
  /** Hz highpass on the strike — hardness of the mallet. */
  strikeTone: number;
  /** 0–1 audible level of the raw strike itself. */
  strikeLevel: number;
  /** Semitones the whole mode bank is transposed by. */
  pitch: number;
  /** 0–1 send into the shared generated-IR reverb (absent = dry). */
  reverb?: number;
  volume: number;
  lowpass: number;
};

/** Every playable one-shot/loop kind — everything except a pulse or a seq. */
export type SingleSpec =
  | ChimeSpec
  | SweepSpec
  | BuzzSpec
  | TuneSpec
  | ShatterSpec
  | NoiseSpec
  | ModalSpec;

/**
 * One sound re-fired over and over at a rate that ramps from `startRate` to
 * `endRate` — the whole shape of a countdown. Ticks that crowd together,
 * beeps that climb in pitch and get louder as the timer runs out.
 *
 * Pulses are scheduled ahead on the audio clock rather than by setTimeout, so
 * the beat stays rock-steady even while the main thread is busy animating.
 * `tick`/`tock` must be one-shots — a looping child would stack up forever.
 */
export type PulseSpec = {
  kind: "pulse";
  /** Sound fired on every pulse (on even pulses when `tock` is set). */
  tick: SingleSpec;
  /** Optional alternate sound on odd pulses — tick, tock, tick, tock. */
  tock?: SingleSpec;
  /** Pulses per second at the start. */
  startRate: number;
  /** Pulses per second once the ramp is done (above startRate = speeding up). */
  endRate: number;
  /**
   * Seconds the rate ramp takes (0 = start at endRate). Rate moves
   * geometrically, so each pulse crowds the next by a constant proportion —
   * an accelerating tick reads as accelerating rather than as a slow drift.
   * Pulsing continues at endRate after the ramp finishes.
   */
  rampDur: number;
  /** Total seconds of pulsing; 0 = until stopped. */
  duration: number;
  /** Semitones the pulse sound rises across the ramp (negative = winds down). */
  pitchRise: number;
  /** Level multiplier reached at the end of the ramp (1 = flat). */
  volumeRise: number;
};

/** One child sound of a seq, fired `at` seconds after the seq starts. */
export type SeqStep = {
  at: number;
  spec: SingleSpec | PulseSpec;
};

/**
 * Timed combo of other specs. Steps may overlap freely — a step's `at` can
 * land inside an earlier sound's tail (how a clack "cuts into" a thock), and
 * two steps at the same offset simply play together. One level deep by
 * construction: steps hold a single sound or a pulse, never another seq.
 * A JS timer wakes each step slightly early and hands the child its exact
 * audio-clock start time, so offsets land where they were written.
 */
export type SeqSpec = {
  kind: "seq";
  steps: SeqStep[];
};

export type SynthSpec = SingleSpec | PulseSpec | SeqSpec;

export type SynthHandle = { stop: () => void };

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/**
 * Create/resume the AudioContext ahead of time so the first playSpec doesn't
 * pay context-startup latency. Call from any user gesture (click, keydown).
 */
export function unlockAudio(): void {
  getCtx();
}

/**
 * When a sound should start on the audio clock. Callers that schedule ahead
 * (seq steps, pulse ticks) pass an absolute time; everyone else gets "now,
 * plus a hair" so the graph is built before the first sample is needed. A
 * time that has already passed falls back to now — a late JS timer plays the
 * sound immediately instead of trying to run an envelope that is already over.
 */
function startTime(ac: AudioContext, at?: number): number {
  const soon = ac.currentTime + 0.01;
  return at !== undefined && at > soon ? at : soon;
}

/** Total seconds of a one-shot spec; null for loops (buzz, endless noise). */
export function specDuration(spec: SynthSpec): number | null {
  if (spec.kind === "chime")
    return Math.max(0, spec.notes.length - 1) * spec.noteGap + spec.noteDur;
  if (spec.kind === "sweep")
    return (
      spec.repeats * spec.duration + Math.max(0, spec.repeats - 1) * spec.repeatGap
    );
  if (spec.kind === "shatter")
    // With no shards there is no tail to wait out — just the crack itself.
    return spec.shards > 0
      ? Math.max(spec.impactDecay, spec.spread + spec.shardDecay)
      : spec.impactDecay;
  if (spec.kind === "noise")
    return spec.duration > 0 ? spec.duration + spec.release : null;
  if (spec.kind === "modal")
    return spec.strike + Math.max(0, ...spec.modes.map((m) => m.d));
  if (spec.kind === "tune") {
    const spb = 60 / spec.bpm;
    let end = 0;
    for (const voice of spec.voices)
      for (const note of voice.notes)
        end = Math.max(end, (note.at + note.d) * spb + voice.release);
    for (const hit of spec.drums) end = Math.max(end, hit.at * spb + 0.4);
    return end;
  }
  if (spec.kind === "pulse") {
    if (spec.duration <= 0) return null;
    // The last pulse can land on `duration` itself, so its own tail counts.
    return spec.duration + (specDuration(spec.tick) ?? 0);
  }
  if (spec.kind === "seq") {
    let end = 0;
    for (const step of spec.steps) {
      const d = specDuration(step.spec);
      if (d === null) return null;
      end = Math.max(end, step.at + d);
    }
    return end;
  }
  return null;
}

/** `at` is an audio-clock time; omit it to start now (the usual case). */
export function playSpec(spec: SynthSpec, at?: number): SynthHandle {
  switch (spec.kind) {
    case "chime":
      return playChime(spec, at);
    case "sweep":
      return playSweep(spec, at);
    case "buzz":
      return playBuzz(spec, at);
    case "tune":
      return playTune(spec, at);
    case "shatter":
      return playShatter(spec, at);
    case "noise":
      return playNoise(spec, at);
    case "modal":
      return playModal(spec, at);
    case "pulse":
      return playPulse(spec, at);
    case "seq":
      return playSeq(spec, at);
  }
}

function playSeq(spec: SeqSpec, at?: number): SynthHandle {
  // Warm the context now so delayed steps don't pay startup latency.
  const ac = getCtx();
  const base = startTime(ac, at);
  const handles: SynthHandle[] = [];
  const timers: ReturnType<typeof setTimeout>[] = [];
  for (const step of spec.steps) {
    const when = base + step.at;
    // Wake the timer early and hand the child its exact audio-clock time, so
    // timer jitter shifts when the graph is built, not when the sound lands.
    const delay = (when - ac.currentTime - 0.15) * 1000;
    if (delay <= 0) handles.push(playSpec(step.spec, when));
    else
      timers.push(
        setTimeout(() => {
          handles.push(playSpec(step.spec, when));
        }, delay),
      );
  }
  return {
    stop() {
      for (const t of timers) clearTimeout(t);
      for (const h of handles) h.stop();
    },
  };
}

// --- pulse -----------------------------------------------------------------

/**
 * Shift a sound by `semis` semitones. Every kind has its own idea of pitch —
 * a chime has a base note, a shatter has a shard range, a noise has a filter
 * — so an accelerating tick can climb regardless of what it is made of.
 */
function transposeSpec(spec: SingleSpec, semis: number): SingleSpec {
  if (!semis) return spec;
  const r = Math.pow(2, semis / 12);
  switch (spec.kind) {
    case "chime":
      return { ...spec, baseFreq: spec.baseFreq * r };
    case "sweep":
      return { ...spec, startFreq: spec.startFreq * r, endFreq: spec.endFreq * r };
    case "buzz":
      return { ...spec, baseFreq: spec.baseFreq * r };
    case "tune":
      return { ...spec, root: spec.root * r };
    case "modal":
      return { ...spec, pitch: spec.pitch + semis };
    case "shatter":
      return {
        ...spec,
        impactTone: spec.impactTone * r,
        shardLow: spec.shardLow * r,
        shardHigh: spec.shardHigh * r,
      };
    case "noise":
      return {
        ...spec,
        filterFreq: spec.filterFreq * r,
        crackleTone: spec.crackleTone * r,
      };
  }
}

function scaleVolume(spec: SingleSpec, mul: number): SingleSpec {
  if (mul === 1) return spec;
  return { ...spec, volume: Math.min(1, Math.max(0, spec.volume * mul)) };
}

/** How far along a pulse's rate ramp `offset` seconds in is, 0–1. */
function pulseProgress(spec: PulseSpec, offset: number): number {
  return spec.rampDur > 0 ? Math.min(1, offset / spec.rampDur) : 1;
}

/**
 * Seconds from the pulse at `offset` to the next one. Rate is interpolated
 * geometrically, so each gap shrinks by a constant proportion of the last —
 * which is what an accelerating tick sounds like. A linear rate ramp spends
 * most of its length barely changing and then lurches.
 */
export function pulseGap(spec: PulseSpec, offset: number): number {
  const startRate = Math.max(0.05, spec.startRate);
  const endRate = Math.max(0.05, spec.endRate);
  const growth = endRate / startRate;
  return 1 / (startRate * Math.pow(growth, pulseProgress(spec, offset)));
}

/**
 * The exact sound of pulse number `count`, landing `offset` seconds in:
 * tick or tock, transposed and levelled to wherever the ramp has got to.
 */
export function shapePulse(
  spec: PulseSpec,
  offset: number,
  count: number,
): SingleSpec {
  const p = pulseProgress(spec, offset);
  const source = count % 2 === 1 && spec.tock ? spec.tock : spec.tick;
  return scaleVolume(
    transposeSpec(source, spec.pitchRise * p),
    1 + (spec.volumeRise - 1) * p,
  );
}

/** Seconds of pulses queued onto the audio clock ahead of real time. */
const PULSE_LOOKAHEAD = 0.6;

function playPulse(spec: PulseSpec, at?: number): SynthHandle {
  const ac = getCtx();
  const t0 = startTime(ac, at);
  const total = spec.duration > 0 ? spec.duration : Infinity;

  const live: { handle: SynthHandle; until: number }[] = [];
  let offset = 0;
  let count = 0;
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  // Queue every pulse that falls inside the lookahead window, then drop the
  // handles of ones that have finished so an endless tick doesn't pile up.
  const pump = () => {
    if (stopped) return;
    const horizon = ac.currentTime - t0 + PULSE_LOOKAHEAD;
    while (offset <= total && offset <= horizon) {
      const shaped = shapePulse(spec, offset, count);
      const handle = playSpec(shaped, t0 + offset);
      live.push({ handle, until: t0 + offset + (specDuration(shaped) ?? 0.5) });
      count++;
      offset += pulseGap(spec, offset);
    }
    for (let i = live.length - 1; i >= 0; i--)
      if (live[i].until < ac.currentTime) live.splice(i, 1);
    if (offset > total && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  pump();
  if (offset <= total) timer = setInterval(pump, 200);

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      if (timer !== null) clearInterval(timer);
      timer = null;
      for (const l of live) l.handle.stop();
      live.length = 0;
    },
  };
}

// --- shared reverb ---------------------------------------------------------

let reverbConvolver: ConvolverNode | null = null;

/**
 * One shared ConvolverNode whose impulse response is generated on first use:
 * two channels of decorrelated noise under an exponential decay, darkening
 * toward the tail like a real room. Specs opt in with `reverb: 0–1`.
 */
function getReverbNode(ac: AudioContext): ConvolverNode {
  if (!reverbConvolver || reverbConvolver.context !== ac) {
    const dur = 2.4;
    const len = Math.floor(ac.sampleRate * dur);
    const ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      const rand = rng(987 + ch);
      // One-pole lowpass whose cutoff falls with time — highs die first.
      let filtered = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const k = 0.55 - 0.4 * t;
        filtered += k * ((rand() * 2 - 1) - filtered);
        data[i] = filtered * Math.exp(-4.5 * t);
      }
    }
    reverbConvolver = ac.createConvolver();
    reverbConvolver.buffer = ir;
    reverbConvolver.connect(ac.destination);
  }
  return reverbConvolver;
}

/** Tap `from` into the shared reverb at `amount` (no-op when 0/absent). */
function reverbSend(
  ac: AudioContext,
  from: AudioNode,
  amount: number | undefined,
): void {
  if (!amount || amount <= 0) return;
  const g = ac.createGain();
  g.gain.value = amount;
  from.connect(g);
  g.connect(getReverbNode(ac));
}

function makeHandle(
  ac: AudioContext,
  master: GainNode,
  oscs: AudioScheduledSourceNode[],
): SynthHandle {
  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      const t = ac.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + 0.03);
      for (const o of oscs) {
        try {
          o.stop(t + 0.05);
        } catch {
          // already stopped
        }
      }
    },
  };
}

function outputChain(
  ac: AudioContext,
  volume: number,
  lowpass: number,
  reverb?: number,
) {
  const master = ac.createGain();
  master.gain.value = volume;
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = lowpass;
  master.connect(lp);
  lp.connect(ac.destination);
  reverbSend(ac, lp, reverb);
  return master;
}

function playChime(spec: ChimeSpec, at?: number): SynthHandle {
  const ac = getCtx();
  const t0 = startTime(ac, at);
  const master = outputChain(ac, spec.volume, spec.lowpass, spec.reverb);
  const oscs: OscillatorNode[] = [];

  spec.notes.forEach((semi, i) => {
    const start = t0 + i * spec.noteGap;
    const freq = Math.max(20, spec.baseFreq * Math.pow(2, semi / 12));
    const layers = spec.detune > 0 ? [0, spec.detune] : [0];
    for (const cents of layers) {
      const osc = ac.createOscillator();
      osc.type = spec.wave;
      osc.frequency.value = freq;
      osc.detune.value = cents;
      const g = ac.createGain();
      const peak = cents === 0 ? 1 : 0.4;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(peak, start + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, start + spec.noteDur);
      osc.connect(g);
      g.connect(master);
      osc.start(start);
      osc.stop(start + spec.noteDur + 0.05);
      oscs.push(osc);
    }
  });

  return makeHandle(ac, master, oscs);
}

function distortionCurve(amount: number): Float32Array {
  const k = amount * 100;
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

function playSweep(spec: SweepSpec, at?: number): SynthHandle {
  const ac = getCtx();
  const t0 = startTime(ac, at);
  const master = outputChain(ac, spec.volume, spec.lowpass, spec.reverb);
  const pre = ac.createGain();
  if (spec.distortion > 0) {
    const shaper = ac.createWaveShaper();
    shaper.curve = distortionCurve(spec.distortion);
    pre.connect(shaper);
    shaper.connect(master);
  } else {
    pre.connect(master);
  }
  const oscs: OscillatorNode[] = [];

  for (let r = 0; r < spec.repeats; r++) {
    const start = t0 + r * (spec.duration + spec.repeatGap);
    const shift = Math.pow(2, (-r * spec.repeatDrop) / 12);
    const f0 = Math.max(20, spec.startFreq * shift);
    const f1 = Math.max(20, spec.endFreq * shift);

    const osc = ac.createOscillator();
    osc.type = spec.wave;
    osc.frequency.setValueAtTime(f0, start);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, start + spec.duration);

    if (spec.vibratoRate > 0 && spec.vibratoDepth > 0) {
      const lfo = ac.createOscillator();
      lfo.frequency.value = spec.vibratoRate;
      const lg = ac.createGain();
      lg.gain.value = spec.vibratoDepth;
      lfo.connect(lg);
      lg.connect(osc.frequency);
      lfo.start(start);
      lfo.stop(start + spec.duration + 0.1);
      oscs.push(lfo);
    }

    const g = ac.createGain();
    const release = Math.min(0.04, spec.duration * 0.3);
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(1, start + Math.min(0.008, spec.duration * 0.2));
    g.gain.setValueAtTime(1, start + spec.duration - release);
    g.gain.linearRampToValueAtTime(0, start + spec.duration);
    osc.connect(g);
    g.connect(pre);
    osc.start(start);
    osc.stop(start + spec.duration + 0.05);
    oscs.push(osc);
  }

  return makeHandle(ac, master, oscs);
}

/**
 * One burst cycle (fade in → hold → fade out → silence) as a control-rate
 * buffer. Looped by an AudioBufferSourceNode driving a gain param, so the
 * on/off pattern is sample-accurate and runs forever without a JS scheduler.
 */
function makeGateBuffer(
  ac: AudioContext,
  on: number,
  off: number,
  fade: number,
): AudioBuffer {
  const rate = ac.sampleRate;
  const len = Math.max(1, Math.round((on + off) * rate));
  const buffer = ac.createBuffer(1, len, rate);
  const data = buffer.getChannelData(0);
  const onLen = Math.max(1, Math.round(on * rate));
  const fadeLen = Math.max(1, Math.round(Math.min(fade, on / 2) * rate));

  for (let i = 0; i < onLen && i < len; i++) {
    let v = 1;
    if (i < fadeLen) v = i / fadeLen;
    else if (i > onLen - fadeLen) v = (onLen - i) / fadeLen;
    // Squared so the swell is perceptually smooth rather than a linear ramp
    // that still reads as a click at the edges.
    data[i] = v * v;
  }
  return buffer;
}

function playBuzz(spec: BuzzSpec, at?: number): SynthHandle {
  const ac = getCtx();
  const t0 = startTime(ac, at);

  const master = ac.createGain();
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = spec.lowpass;
  const panner = ac.createStereoPanner();

  const oscs: AudioScheduledSourceNode[] = [];

  if (spec.burstOn > 0 && spec.burstOff > 0) {
    const gate = ac.createGain();
    gate.gain.value = 0; // driven entirely by the looping gate buffer
    const gateSrc = ac.createBufferSource();
    gateSrc.buffer = makeGateBuffer(ac, spec.burstOn, spec.burstOff, spec.burstFade);
    gateSrc.loop = true;
    gateSrc.connect(gate.gain);
    gateSrc.start(t0);
    oscs.push(gateSrc);
    master.connect(gate);
    gate.connect(lp);
  } else {
    master.connect(lp);
  }
  lp.connect(panner);
  panner.connect(ac.destination);
  reverbSend(ac, panner, spec.reverb);

  // Base level leaves headroom for the tremolo LFO riding on top of it.
  const tremDepth = Math.min(1, Math.max(0, spec.tremDepth));
  const baseGain = spec.volume * (1 - tremDepth * 0.5);
  master.gain.setValueAtTime(0, t0);
  master.gain.linearRampToValueAtTime(baseGain, t0 + 0.02);

  if (spec.tremRate > 0 && tremDepth > 0) {
    const trem = ac.createOscillator();
    trem.frequency.value = spec.tremRate;
    const tg = ac.createGain();
    tg.gain.value = spec.volume * tremDepth * 0.5;
    trem.connect(tg);
    tg.connect(master.gain);
    trem.start(t0);
    oscs.push(trem);
  }

  let wobGain: GainNode | null = null;
  if (spec.wobbleRate > 0 && spec.wobbleDepth > 0) {
    const wob = ac.createOscillator();
    wob.frequency.value = spec.wobbleRate;
    wobGain = ac.createGain();
    wobGain.gain.value = spec.wobbleDepth;
    wob.connect(wobGain);
    wob.start(t0);
    oscs.push(wob);
  }

  const layers = Math.max(1, Math.round(spec.layers));
  for (let li = 0; li < layers; li++) {
    const osc = ac.createOscillator();
    osc.type = spec.wave;
    osc.frequency.value = spec.baseFreq;
    osc.detune.value = (li - (layers - 1) / 2) * spec.layerDetune;
    if (wobGain) wobGain.connect(osc.frequency);
    const g = ac.createGain();
    g.gain.value = 1 / layers;
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    oscs.push(osc);
  }

  if (spec.panRate > 0) {
    const pan = ac.createOscillator();
    pan.frequency.value = spec.panRate;
    const pg = ac.createGain();
    pg.gain.value = 0.8;
    pan.connect(pg);
    pg.connect(panner.pan);
    pan.start(t0);
    oscs.push(pan);
  }

  return makeHandle(ac, master, oscs);
}

// --- tunes -----------------------------------------------------------------

let noiseBuf: AudioBuffer | null = null;

/** Two seconds of white noise, reused by every drum and shard click. */
function getNoise(ac: AudioContext): AudioBuffer {
  if (!noiseBuf || noiseBuf.sampleRate !== ac.sampleRate) {
    const len = Math.floor(ac.sampleRate * 2);
    noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    const data = noiseBuf.getChannelData(0);
    // Deterministic fill: the same noise every session keeps a given spec
    // sounding identical run to run.
    let s = 22222;
    for (let i = 0; i < len; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      data[i] = (s / 0xffffffff) * 2 - 1;
    }
  }
  return noiseBuf;
}

function noiseBurst(
  ac: AudioContext,
  dest: AudioNode,
  start: number,
  duration: number,
  filter: { type: BiquadFilterType; freq: number; q?: number },
  level: number,
  sources: AudioScheduledSourceNode[],
  attack = 0.001,
): void {
  const src = ac.createBufferSource();
  src.buffer = getNoise(ac);
  src.loop = true;
  const bq = ac.createBiquadFilter();
  bq.type = filter.type;
  bq.frequency.value = filter.freq;
  if (filter.q !== undefined) bq.Q.value = filter.q;
  const g = ac.createGain();
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(Math.max(0.0001, level), start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  src.connect(bq);
  bq.connect(g);
  g.connect(dest);
  src.start(start);
  src.stop(start + duration + 0.05);
  sources.push(src);
}

function playDrum(
  ac: AudioContext,
  dest: AudioNode,
  type: DrumType,
  start: number,
  vel: number,
  sources: AudioScheduledSourceNode[],
): void {
  switch (type) {
    case "kick": {
      const osc = ac.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(150, start);
      osc.frequency.exponentialRampToValueAtTime(45, start + 0.12);
      const g = ac.createGain();
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(vel, start + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      osc.connect(g);
      g.connect(dest);
      osc.start(start);
      osc.stop(start + 0.3);
      sources.push(osc);
      break;
    }
    case "snare": {
      noiseBurst(ac, dest, start, 0.18, { type: "bandpass", freq: 1700, q: 0.8 }, vel * 0.7, sources);
      const osc = ac.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = 190;
      const g = ac.createGain();
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(vel * 0.4, start + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.1);
      osc.connect(g);
      g.connect(dest);
      osc.start(start);
      osc.stop(start + 0.15);
      sources.push(osc);
      break;
    }
    case "hat":
      noiseBurst(ac, dest, start, 0.05, { type: "highpass", freq: 7000 }, vel * 0.5, sources);
      break;
    case "clap":
      for (let i = 0; i < 3; i++)
        noiseBurst(
          ac, dest, start + i * 0.013, 0.12,
          { type: "bandpass", freq: 1300, q: 1.2 }, vel * 0.5, sources,
        );
      break;
    case "crash":
      noiseBurst(ac, dest, start, 1.4, { type: "highpass", freq: 4500 }, vel * 0.35, sources);
      break;
    case "roll":
      // Swelling snare roll — the "here it comes" build before a hit.
      noiseBurst(ac, dest, start, 0.9, { type: "bandpass", freq: 1800, q: 0.7 }, vel * 0.45, sources, 0.7);
      break;
    case "applause":
      noiseBurst(ac, dest, start, 2.2, { type: "bandpass", freq: 1500, q: 0.5 }, vel * 0.3, sources, 0.25);
      for (let i = 0; i < 10; i++)
        noiseBurst(
          ac, dest, start + 0.1 + i * 0.09, 0.1,
          { type: "bandpass", freq: 1100 + i * 130, q: 1.5 }, vel * 0.12, sources,
        );
      break;
  }
}

function playTune(spec: TuneSpec, at?: number): SynthHandle {
  const ac = getCtx();
  const t0 = startTime(ac, at);
  const spb = 60 / spec.bpm;

  const master = ac.createGain();
  master.gain.value = spec.volume;
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = spec.lowpass;
  master.connect(lp);
  lp.connect(ac.destination);
  reverbSend(ac, lp, spec.reverb);

  if (spec.echo > 0) {
    const delay = ac.createDelay(2);
    delay.delayTime.value = spb * 0.75;
    const feedback = ac.createGain();
    feedback.gain.value = Math.min(0.55, spec.echo * 0.55);
    const wet = ac.createGain();
    wet.gain.value = spec.echo * 0.5;
    master.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(lp);
  }

  const sources: AudioScheduledSourceNode[] = [];

  for (const voice of spec.voices) {
    const vg = ac.createGain();
    vg.gain.value = voice.volume;
    vg.connect(master);
    const octave = voice.octave ?? 0;

    for (const note of voice.notes) {
      const start = t0 + note.at * spb;
      const dur = Math.max(0.02, note.d * spb);
      const semis = Array.isArray(note.n) ? note.n : [note.n];
      // Chords divide their level between members so a six-note stab isn't
      // six times louder than a single melody note.
      const spread = Math.sqrt(semis.length);

      for (const semi of semis) {
        const freq = spec.root * Math.pow(2, semi / 12 + octave);
        const layers = voice.detune ? [0, voice.detune] : [0];
        for (const cents of layers) {
          const osc = ac.createOscillator();
          osc.type = voice.wave;
          osc.frequency.value = Math.max(20, freq);
          osc.detune.value = cents;
          const g = ac.createGain();
          const peak = Math.max(
            0.0005,
            ((note.v ?? 1) * (cents === 0 ? 1 : 0.5)) / spread,
          );
          const attack = Math.min(voice.attack, dur * 0.5);
          const tail = Math.max(0.001, voice.sustain);
          g.gain.setValueAtTime(0, start);
          g.gain.linearRampToValueAtTime(peak, start + attack);
          g.gain.exponentialRampToValueAtTime(peak * tail, start + dur);
          g.gain.exponentialRampToValueAtTime(0.0001, start + dur + voice.release);
          osc.connect(g);
          g.connect(vg);
          osc.start(start);
          osc.stop(start + dur + voice.release + 0.05);
          sources.push(osc);
        }
      }
    }
  }

  for (const hit of spec.drums)
    playDrum(ac, master, hit.type, t0 + hit.at * spb, hit.v ?? 0.8, sources);

  return makeHandle(ac, master, sources);
}

// --- glass -----------------------------------------------------------------

/** mulberry32 — small seeded PRNG so a spec always breaks the same way. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function playShatter(spec: ShatterSpec, at?: number): SynthHandle {
  const ac = getCtx();
  const t0 = startTime(ac, at);
  const master = ac.createGain();
  master.gain.value = spec.volume;
  master.connect(ac.destination);
  reverbSend(ac, master, spec.reverb);

  const sources: AudioScheduledSourceNode[] = [];
  const rand = rng(spec.seed);

  if (spec.impact > 0) {
    noiseBurst(
      ac, master, t0, spec.impactDecay,
      { type: "highpass", freq: spec.impactTone }, spec.impact, sources,
    );
    // A touch of midrange keeps the crack from sounding like pure hiss.
    noiseBurst(
      ac, master, t0, spec.impactDecay * 0.6,
      { type: "bandpass", freq: spec.impactTone * 0.45, q: 0.7 },
      spec.impact * 0.5, sources,
    );
  }

  if (spec.body > 0) {
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, t0);
    osc.frequency.exponentialRampToValueAtTime(55, t0 + 0.18);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(spec.body, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + 0.35);
    sources.push(osc);
  }

  for (let i = 0; i < spec.shards; i++) {
    // Skewing the time draw bunches shards right after the impact, which is
    // how a real break sounds: a rush of glass, then stragglers.
    const when = spec.spread * Math.pow(rand(), 1 + spec.clump * 3);
    const start = t0 + when;
    const freq =
      spec.shardLow * Math.pow(spec.shardHigh / spec.shardLow, rand());
    const decay = spec.shardDecay * (0.4 + rand() * 0.9);
    const level = 0.25 + rand() * 0.75;

    const osc = ac.createOscillator();
    osc.type = rand() > 0.5 ? "sine" : "triangle";
    osc.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(level, start + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, start + decay);
    osc.connect(g);
    g.connect(master);
    osc.start(start);
    osc.stop(start + decay + 0.02);
    sources.push(osc);

    // Every few shards gets a click so the tail sounds like glass landing
    // rather than a row of tuned bleeps.
    if (rand() > 0.6)
      noiseBurst(
        ac, master, start, 0.03,
        { type: "highpass", freq: 5000 }, level * 0.3, sources,
      );
  }

  return makeHandle(ac, master, sources);
}

// --- noise -----------------------------------------------------------------

const crackleBufs = new Map<number, AudioBuffer>();

/**
 * Four seconds of sparse decaying impulses at roughly `rate` per second,
 * looped forever by an AudioBufferSourceNode. Deterministic, so a given rate
 * always crackles in the same pattern.
 */
function getCrackleBuffer(ac: AudioContext, rate: number): AudioBuffer {
  const cached = crackleBufs.get(rate);
  if (cached && cached.sampleRate === ac.sampleRate) return cached;

  const seconds = 4;
  const len = Math.floor(ac.sampleRate * seconds);
  const buffer = ac.createBuffer(1, len, ac.sampleRate);
  const data = buffer.getChannelData(0);
  const rand = rng(1234 + Math.round(rate * 100));

  const count = Math.max(1, Math.round(rate * seconds));
  for (let c = 0; c < count; c++) {
    const at = Math.floor(rand() * len);
    const amp = 0.3 + rand() * 0.7;
    // 2–10 ms of decaying noise per impulse — a pop, not a click.
    const burstLen = Math.floor(ac.sampleRate * (0.002 + rand() * 0.008));
    for (let i = 0; i < burstLen && at + i < len; i++) {
      data[at + i] += (rand() * 2 - 1) * amp * (1 - i / burstLen) ** 2;
    }
  }

  crackleBufs.set(rate, buffer);
  return buffer;
}

function playNoise(spec: NoiseSpec, at?: number): SynthHandle {
  const ac = getCtx();
  const t0 = startTime(ac, at);

  const master = ac.createGain();
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = spec.lowpass;
  const panner = ac.createStereoPanner();
  master.connect(lp);
  lp.connect(panner);
  panner.connect(ac.destination);
  reverbSend(ac, panner, spec.reverb);

  const sources: AudioScheduledSourceNode[] = [];

  // Swell rides its own gain stage so the master stays free for the
  // attack/release envelope and the stop() ramp.
  const swellDepth = Math.min(1, Math.max(0, spec.swellDepth));
  const swell = ac.createGain();
  swell.gain.value = spec.swellRate > 0 ? 1 - swellDepth * 0.5 : 1;
  swell.connect(master);
  if (spec.swellRate > 0 && swellDepth > 0) {
    const lfo = ac.createOscillator();
    lfo.frequency.value = spec.swellRate;
    const lg = ac.createGain();
    lg.gain.value = swellDepth * 0.5;
    lfo.connect(lg);
    lg.connect(swell.gain);
    lfo.start(t0);
    sources.push(lfo);
  }

  if (spec.bedLevel > 0) {
    const src = ac.createBufferSource();
    src.buffer = getNoise(ac);
    src.loop = true;
    const bq = ac.createBiquadFilter();
    bq.type = spec.filterType;
    bq.frequency.value = spec.filterFreq;
    bq.Q.value = spec.filterQ;
    const g = ac.createGain();
    g.gain.value = spec.bedLevel;
    src.connect(bq);
    bq.connect(g);
    g.connect(swell);
    src.start(t0);
    sources.push(src);

    // Two incommensurate LFOs so the filter wanders instead of pulsing.
    if (spec.driftRate > 0 && spec.driftDepth > 0) {
      const rates = [spec.driftRate, spec.driftRate * 0.37];
      const depths = [spec.driftDepth, spec.driftDepth * 0.5];
      for (let i = 0; i < rates.length; i++) {
        const lfo = ac.createOscillator();
        lfo.frequency.value = rates[i];
        const lg = ac.createGain();
        lg.gain.value = depths[i];
        lfo.connect(lg);
        lg.connect(bq.frequency);
        lfo.start(t0 + i * 0.13);
        sources.push(lfo);
      }
    }
  }

  if (spec.crackleRate > 0 && spec.crackleLevel > 0) {
    const src = ac.createBufferSource();
    src.buffer = getCrackleBuffer(ac, spec.crackleRate);
    src.loop = true;
    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = spec.crackleTone;
    const g = ac.createGain();
    g.gain.value = spec.crackleLevel;
    src.connect(hp);
    hp.connect(g);
    g.connect(swell);
    src.start(t0);
    sources.push(src);
  }

  if (spec.panRate > 0) {
    const pan = ac.createOscillator();
    pan.frequency.value = spec.panRate;
    const pg = ac.createGain();
    pg.gain.value = 0.7;
    pan.connect(pg);
    pg.connect(panner.pan);
    pan.start(t0);
    sources.push(pan);
  }

  const attack = Math.max(0.005, spec.attack);
  master.gain.setValueAtTime(0, t0);
  master.gain.linearRampToValueAtTime(spec.volume, t0 + attack);
  if (spec.duration > 0) {
    const end = t0 + spec.duration;
    master.gain.setValueAtTime(spec.volume, end);
    // Exponential-ish release reads as sound receding, not a fader pull.
    master.gain.exponentialRampToValueAtTime(0.0001, end + Math.max(0.02, spec.release));
    for (const s of sources) s.stop(end + spec.release + 0.1);
  }

  return makeHandle(ac, master, sources);
}

// --- modal -----------------------------------------------------------------

function playModal(spec: ModalSpec, at?: number): SynthHandle {
  const ac = getCtx();
  const t0 = startTime(ac, at);
  const master = outputChain(ac, spec.volume, spec.lowpass, spec.reverb);
  const sources: AudioScheduledSourceNode[] = [];
  const transpose = Math.pow(2, spec.pitch / 12);

  if (spec.strikeLevel > 0 && spec.strike > 0)
    noiseBurst(
      ac, master, t0, spec.strike,
      { type: "highpass", freq: spec.strikeTone }, spec.strikeLevel, sources,
    );

  for (const mode of spec.modes) {
    const freq = Math.max(20, mode.f * transpose);
    const layers = spec.shimmer > 0 ? [0, spec.shimmer] : [0];
    for (const cents of layers) {
      const osc = ac.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.detune.value = cents;
      const g = ac.createGain();
      const peak = Math.max(0.0005, mode.a * (cents === 0 ? 1 : 0.4));
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + mode.d);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + mode.d + 0.05);
      sources.push(osc);
    }
  }

  return makeHandle(ac, master, sources);
}
