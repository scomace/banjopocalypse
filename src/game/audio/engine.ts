// The jug-band audio engine. SFX are synthesized WebAudio (plus a few
// sampled one-shots, see SAMPLE_SFX),
// architecture in the spirit of accountingsurvivor's lib/sfx/synth.ts
// (buffer-rendered hot sounds, one master bus).
//
// Instruments (SFX):
//   banjo    - Karplus-Strong plucked string rendered into cached buffers
//   jawharp  - comb-filtered square twang with pitch bend
//   fiddle   - detuned saws + vibrato (duels)
//   choir    - detuned saw stack through a formant-ish filter (prayer/endings)
//
// Music is mp3 tracks from public/music: each level rolls a random track and
// loops it until the level index changes. The track is routed through the
// music bus, so the volume slider applies and the Mega-Belch still
// sidechain-ducks it for half a second.

import type { FxEvent, Sim } from "../sim/types";
import { loadSettings } from "../core/save";

// Everything in public/music. Vite can't glob the public dir, so the list
// lives here; add new files to both places.
const MUSIC_TRACKS = [
  "A Day On the Farm.mp3",
  "Banjo Farm Loop.mp3",
  "Banjo Hoedown- Andy Slatter.mp3",
  "Banjo.mp3",
  "Cheerful Banjo.mp3",
  "Country Folk.mp3",
  "Dagored_banjo-bluegrass-country-fun_main.mp3",
  "Full Track.mp3",
  "Lonely Banjo.mp3",
  "Never Stop Smile main.mp3",
  "Rodeo Banjo.mp3",
];

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/**
 * Sampled one-shots. To add one: drop an mp3/wav in public/sounds, add a
 * line here, and play it from a playSfx case via this.playSample(name, ...).
 * The engine fetches, peak-normalizes and trims each file at load. A missing
 * or broken file is NOT an error: playSample returns false and the case
 * falls back to synth, so the game sounds right before the recording lands.
 *   gain: playback level (post-normalize)   cut: cap on played length, s
 *   fade: fade-out length before the cut, s (default 0.03)
 */
const SAMPLE_SFX: Record<string, { file: string; gain?: number; cut?: number; fade?: number }> = {
  /** gassed out: the hiccup that ate the double jump */
  windFail: { file: "wind-fail.mp3", gain: 0.8 },
  /** last pips of wind: the wheeze under the jump */
  windStrain: { file: "wind-strain.mp3", gain: 0.5 },
  /** Granny Mae's air special: the bean-powered scoot. The recording has a
   *  ~230ms room tail after its ~160ms body; cut it off so it reads dry. */
  fart: { file: "fart.mp3", gain: 0.8, cut: 0.2, fade: 0.05 },
  /** Granny Mae gassed out: the whiff when the beans run dry */
  wetfart: { file: "wetfart.mp3", gain: 0.8 },
  /** the hog stampede special popping */
  hogSqueal: { file: "pigsqueal.mp3", gain: 0.8 },
};

export class JugBandAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private musicDuck!: GainNode;
  private sfxBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private banjoCache = new Map<number, AudioBuffer>();
  private burpBuf: AudioBuffer | null = null;
  private burpBufRev: AudioBuffer | null = null;
  private burpVoices: AudioBufferSourceNode[] = [];
  /** SAMPLE_SFX buffers that loaded (name -> normalized, trimmed). */
  private samples = new Map<string, AudioBuffer>();
  private lastBurpSemis = Infinity;
  private trackEl: HTMLAudioElement | null = null;
  private trackLevel = -1;
  private lastTrackIdx = -1;
  private trackPlayPending = false;
  private muted = false;
  musicVolume = 0.7;
  sfxVolume = 0.9;

  /** Must be called from a user gesture at least once. Safe to call often. */
  ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return this.ctx;
    }
    try {
      const ctx = new AudioContext();
      this.ctx = ctx;
      const settings = loadSettings();
      this.musicVolume = settings.musicVolume;
      this.sfxVolume = settings.sfxVolume;

      this.master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 5;
      this.master.connect(comp);
      comp.connect(ctx.destination);

      this.musicDuck = ctx.createGain();
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = this.musicVolume * 0.5;
      this.musicBus.connect(this.musicDuck);
      this.musicDuck.connect(this.master);

      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = this.sfxVolume;
      this.sfxBus.connect(this.master);

      // shared noise buffer
      const len = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      void this.loadBurp(ctx);
      void this.loadSamples(ctx);
      return ctx;
    } catch {
      return null;
    }
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    if (!this.ctx) return;
    this.musicBus.gain.value = music * 0.5;
    this.sfxBus.gain.value = sfx;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.value = m ? 0 : 1;
  }

  // ------------------------------------------------------- samples
  // Sampled sounds: the cute burp (layered under every synthesized hic and
  // re-rolled per play so no two burps sound alike) and the SAMPLE_SFX
  // one-shots. All go through loadSampleBuffer: fetch, decode, normalize,
  // trim the dead air.

  /**
   * Fetch + decode a sample from public/sounds, peak-normalize it to 0.9
   * (so gain math downstream means what it says; recordings land at all
   * levels) and trim leading/trailing silence (leading silence reads as
   * input lag). Null if the file is missing or undecodable.
   */
  private async loadSampleBuffer(ctx: AudioContext, file: string): Promise<AudioBuffer | null> {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}sounds/${file}`);
      if (!res.ok) return null;
      const buf = await ctx.decodeAudioData(await res.arrayBuffer());
      let peak = 0;
      for (let ch = 0; ch < buf.numberOfChannels; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
      }
      if (peak > 0.001) {
        const sc = 0.9 / peak;
        for (let ch = 0; ch < buf.numberOfChannels; ch++) {
          const d = buf.getChannelData(ch);
          for (let i = 0; i < d.length; i++) d[i] *= sc;
        }
      }
      const d0 = buf.getChannelData(0);
      let start = 0;
      while (start < d0.length && Math.abs(d0[start]) < 0.02) start++;
      start = Math.max(0, start - Math.floor(buf.sampleRate * 0.002));
      let end = d0.length - 1;
      while (end > start && Math.abs(d0[end]) < 0.02) end--;
      end = Math.min(d0.length, end + Math.floor(buf.sampleRate * 0.015));
      const trimmed = ctx.createBuffer(buf.numberOfChannels, Math.max(1, end - start), buf.sampleRate);
      for (let ch = 0; ch < buf.numberOfChannels; ch++) {
        trimmed.getChannelData(ch).set(buf.getChannelData(ch).subarray(start, end));
      }
      return trimmed;
    } catch {
      return null;
    }
  }

  private async loadSamples(ctx: AudioContext): Promise<void> {
    await Promise.all(
      Object.entries(SAMPLE_SFX).map(async ([name, def]) => {
        const buf = await this.loadSampleBuffer(ctx, def.file);
        if (buf) this.samples.set(name, buf);
      }),
    );
  }

  /**
   * Play a SAMPLE_SFX one-shot. False if it never loaded (caller plays its
   * synth fallback). pitch is a playback-rate multiplier (also shortens).
   */
  private playSample(name: string, when: number, pitch = 1, pan = 0): boolean {
    const ctx = this.ctx;
    const buf = this.samples.get(name);
    const def = SAMPLE_SFX[name];
    if (!ctx || !buf || !def) return false;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = pitch;
    const g = ctx.createGain();
    const gain = def.gain ?? 0.7;
    g.gain.setValueAtTime(gain, when);
    const natural = buf.duration / pitch;
    const len = def.cut ? Math.min(natural, def.cut) : natural;
    // quick fade so a cut never clicks
    g.gain.setValueAtTime(gain, Math.max(when, when + len - (def.fade ?? 0.03)));
    g.gain.linearRampToValueAtTime(0.0001, when + len);
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan)) * 0.6;
    src.connect(g);
    g.connect(panner);
    panner.connect(this.sfxBus);
    src.start(when);
    src.stop(when + len + 0.02);
    return true;
  }

  private async loadBurp(ctx: AudioContext): Promise<void> {
    const trimmed = await this.loadSampleBuffer(ctx, "cuteburp.mp3");
    if (!trimmed) return; // no burp asset: the synth hic carries on alone
    this.burpBuf = trimmed;
    // pre-render a reversed copy for the rare jackpot burp
    const rev = ctx.createBuffer(trimmed.numberOfChannels, trimmed.length, trimmed.sampleRate);
    for (let ch = 0; ch < trimmed.numberOfChannels; ch++) {
      const src = trimmed.getChannelData(ch);
      const dst = rev.getChannelData(ch);
      for (let i = 0; i < src.length; i++) dst[i] = src[src.length - 1 - i];
    }
    this.burpBufRev = rev;
  }

  private burp(when: number, pan: number): void {
    const ctx = this.ctx;
    const reversed = Math.random() < 0.05;
    const buf = reversed ? this.burpBufRev : this.burpBuf;
    if (!ctx || !buf) return;

    // one rate knob for pitch+length, rolled in semitones around the
    // original: some deeper, some slightly higher, centered near 0.
    // Re-roll once if too close to the last play.
    let semis = -3 + Math.random() * 7;
    if (Math.abs(semis - this.lastBurpSemis) < 1) semis = -3 + Math.random() * 7;
    this.lastBurpSemis = semis;
    const rate = Math.pow(2, semis / 12);
    const dur = buf.duration / rate;
    // keep it a snappy little urp: only the front of the sample escapes
    const len = Math.min(dur, 0.13 + Math.random() * 0.11);

    // voice cap: steal the oldest so bubble spam doesn't wall up
    while (this.burpVoices.length >= 4) {
      try {
        this.burpVoices.shift()!.stop();
      } catch {
        /* already stopped */
      }
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.setValueAtTime(rate, when);
    // drooping burp: a gentle sag over the tail
    if (Math.random() < 0.4) {
      src.playbackRate.linearRampToValueAtTime(rate * (0.9 + Math.random() * 0.05), when + len);
    }

    // dark vs bright reads as a different burp (log-random cutoff, floor
    // high enough that a dark roll doesn't read as pitched-down)
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2600 * Math.pow(9500 / 2600, Math.random());

    const g = ctx.createGain();
    const gain = 0.55 * (0.7 + Math.random() * 0.3); // downward-only volume roll
    g.gain.setValueAtTime(gain, when);

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan)) * 0.6;

    src.connect(lp);
    lp.connect(g);
    g.connect(panner);
    panner.connect(this.sfxBus);

    // always cut at `len` with a quick fade so every burp stays snappy
    const cut = when + len;
    g.gain.setValueAtTime(gain, Math.max(when, cut - 0.045));
    g.gain.linearRampToValueAtTime(0.0001, cut);
    const stopAt = cut + 0.02;

    // occasional holler slapback: one 120ms echo, not a hall
    if (Math.random() < 0.18) {
      const d = ctx.createDelay(0.3);
      d.delayTime.value = 0.12;
      const dg = ctx.createGain();
      dg.gain.value = 0.3;
      panner.connect(d);
      d.connect(dg);
      dg.connect(this.sfxBus);
    }

    src.start(when);
    src.stop(stopAt);
    this.burpVoices.push(src);
    src.onended = () => {
      const i = this.burpVoices.indexOf(src);
      if (i >= 0) this.burpVoices.splice(i, 1);
    };
  }

  // ------------------------------------------------------------ helpers

  private noise(
    when: number,
    dur: number,
    filterHz: number,
    q: number,
    gain: number,
    type: BiquadFilterType = "bandpass",
    bus?: GainNode,
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterHz;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    src.connect(f);
    f.connect(g);
    g.connect(bus ?? this.sfxBus);
    src.start(when, Math.random() * 0.5);
    src.stop(when + dur + 0.02);
  }

  private tone(
    when: number,
    dur: number,
    freq: number,
    type: OscillatorType,
    gain: number,
    opts?: {
      endFreq?: number;
      attack?: number;
      bus?: GainNode;
      detune?: number;
      vibratoHz?: number;
      vibratoCents?: number;
    },
  ): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, when);
    if (opts?.endFreq) {
      o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.endFreq), when + dur);
    }
    if (opts?.detune) o.detune.value = opts.detune;
    if (opts?.vibratoHz) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = opts.vibratoHz;
      const lg = ctx.createGain();
      lg.gain.value = opts.vibratoCents ?? 12;
      lfo.connect(lg);
      lg.connect(o.detune);
      lfo.start(when);
      lfo.stop(when + dur + 0.05);
    }
    const g = ctx.createGain();
    const attack = opts?.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + attack);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    o.connect(g);
    g.connect(opts?.bus ?? this.sfxBus);
    o.start(when);
    o.stop(when + dur + 0.03);
  }

  /** Karplus-Strong pluck rendered offline into a cached buffer. */
  private banjoBuffer(freq: number): AudioBuffer {
    const ctx = this.ctx!;
    const rounded = Math.round(freq);
    const hit = this.banjoCache.get(rounded);
    if (hit) return hit;
    const sr = ctx.sampleRate;
    const dur = 0.9;
    const n = Math.floor(sr * dur);
    const buf = ctx.createBuffer(1, n, sr);
    const out = buf.getChannelData(0);
    const period = Math.max(2, Math.floor(sr / rounded));
    const ring = new Float32Array(period);
    // bright pluck: noise burst with a high-passed edge
    for (let i = 0; i < period; i++) {
      ring[i] = (Math.random() * 2 - 1) * (i < period / 2 ? 1 : 0.6);
    }
    let idx = 0;
    const damp = 0.996;
    for (let i = 0; i < n; i++) {
      const cur = ring[idx];
      const next = ring[(idx + 1) % period];
      out[i] = cur;
      ring[idx] = (cur + next) * 0.5 * damp;
      idx = (idx + 1) % period;
    }
    // fast decay envelope on top for banjo snap
    for (let i = 0; i < n; i++) {
      out[i] *= Math.exp((-3.2 * i) / n);
    }
    this.banjoCache.set(rounded, buf);
    return buf;
  }

  private banjo(when: number, midi: number, gain: number, bus?: GainNode): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.banjoBuffer(midiToFreq(midi));
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(bus ?? this.musicBus);
    src.start(when);
  }

  // ------------------------------------------------------------ SFX

  handleFx(events: FxEvent[]): void {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;
    for (const e of events) {
      if (e.t === "sfx") this.playSfx(e.name, e.pitch ?? 1, now, e.pan ?? 0);
      else if (e.t === "belch") {
        // duck the band under the Mega-Belch
        this.musicDuck.gain.setValueAtTime(0.15, now);
        this.musicDuck.gain.linearRampToValueAtTime(1, now + 0.6);
      }
    }
  }

  playSfx(name: string, pitch: number, now?: number, pan = 0): void {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    const t = now ?? ctx.currentTime;
    switch (name) {
      case "hic": {
        // tiny glottal blip: pitch-varied per blow. When the sampled burp is
        // loaded it carries the sound; the synth just adds the attack blip.
        const hicScale = this.burpBuf ? 0.35 : 1;
        this.tone(t, 0.07, 420 * pitch, "square", 0.12 * hicScale, { endFreq: 720 * pitch, attack: 0.002 });
        this.noise(t, 0.03, 1800, 2, 0.05 * hicScale);
        this.burp(t, pan);
        break;
      }
      case "megaBelch": {
        // the big one: formant-swept sawtooth burp with a pitch-drop tail
        this.tone(t, 0.75, 130, "sawtooth", 0.4, { endFreq: 48, attack: 0.01 });
        this.tone(t, 0.6, 92, "square", 0.22, { endFreq: 40 });
        this.noise(t, 0.55, 240, 1.1, 0.3, "lowpass");
        this.noise(t + 0.05, 0.4, 900, 3, 0.12);
        break;
      }
      case "pop": {
        // pentatonic walk-up handled by caller pitch
        this.noise(t, 0.06, 2400 * pitch, 3, 0.3);
        this.tone(t, 0.12, 520 * pitch, "triangle", 0.25, { endFreq: 780 * pitch });
        break;
      }
      case "popEmpty":
        this.noise(t, 0.05, 1900 * pitch, 3, 0.18);
        break;
      case "trap":
        this.tone(t, 0.16, 240, "sine", 0.22, { endFreq: 460 });
        break;
      case "jump":
        this.tone(t, 0.14, 260 * pitch, "square", 0.1, { endFreq: 520 * pitch });
        break;
      case "bounce":
        this.tone(t, 0.2, 180, "sine", 0.28, { endFreq: 560 });
        break;
      case "escape":
        this.tone(t, 0.25, 600, "sawtooth", 0.14, { endFreq: 180 });
        break;
      case "jarSpawn":
        this.tone(t, 0.3, 880, "sine", 0.1, { endFreq: 1320 });
        this.tone(t + 0.12, 0.3, 1100, "sine", 0.08, { endFreq: 1650 });
        break;
      case "jarGrab": {
        // glass clink + swig + burpette
        this.tone(t, 0.08, 1900, "triangle", 0.2);
        this.noise(t + 0.1, 0.18, 500, 1.2, 0.16, "lowpass");
        this.tone(t + 0.32, 0.16, 150, "sawtooth", 0.2, { endFreq: 70 });
        break;
      }
      case "frenzyStart":
        for (let i = 0; i < 5; i++) {
          this.banjo(t + i * 0.05, 57 + [0, 4, 7, 12, 16][i], 0.5, this.sfxBus);
        }
        break;
      case "frenzyEnd":
        this.tone(t, 0.4, 400, "sine", 0.12, { endFreq: 120 });
        break;
      case "food":
        this.banjo(t, 76 + Math.round((pitch - 1) * 12), 0.35, this.sfxBus);
        break;
      case "letter":
        this.tone(t, 0.3, 1046, "sine", 0.16);
        this.tone(t + 0.09, 0.3, 1318, "sine", 0.14);
        break;
      case "extraLife": {
        const notes = [64, 67, 71, 76];
        notes.forEach((n, i) => this.banjo(t + i * 0.09, n, 0.5, this.sfxBus));
        this.tone(t + 0.36, 0.5, midiToFreq(88), "triangle", 0.15);
        break;
      }
      case "yeehawComplete": {
        const roll = [57, 64, 69, 73, 76, 81];
        roll.forEach((n, i) => this.banjo(t + i * 0.06, n, 0.55, this.sfxBus));
        break;
      }
      case "weaponAcquired": {
        // shrine reveal: a gospel swell under a climbing banjo roll, then a shimmer
        this.gospelChord(t, [55, 62, 67, 71, 74, 79], 2.2, 0.18);
        const roll = [55, 62, 67, 71, 74, 79, 83, 86];
        roll.forEach((n, i) => this.banjo(t + 0.08 + i * 0.07, n, 0.6, this.sfxBus));
        this.tone(t + 0.6, 1.2, midiToFreq(91), "triangle", 0.12, { endFreq: midiToFreq(98) });
        break;
      }
      case "playerDie": {
        // sad solo banjo bend
        this.tone(t, 0.7, 330, "sawtooth", 0.2, { endFreq: 110 });
        this.banjo(t + 0.25, 45, 0.5, this.sfxBus);
        break;
      }
      case "revive":
        this.gospelChord(t, [60, 64, 67, 72], 0.9, 0.14);
        break;
      case "gospel":
        this.gospelChord(t, [60, 64, 67, 71, 74], 1.6, 0.16);
        break;
      case "hogfat":
        this.tone(t, 0.3, 180, "square", 0.2, { endFreq: 90 });
        this.noise(t, 0.2, 700, 1, 0.12, "lowpass");
        break;
      case "hurryUp": {
        // pounding double knock
        for (let i = 0; i < 2; i++) {
          this.noise(t + i * 0.18, 0.1, 200, 1, 0.4, "lowpass");
          this.tone(t + i * 0.18, 0.12, 92, "square", 0.3, { endFreq: 60 });
        }
        break;
      }
      case "secondPour": {
        // still-alarm: three descending banjo stabs over pounding knocks,
        // capped with a pressure-drop groan
        for (let i = 0; i < 3; i++) {
          this.banjo(t + i * 0.14, 64 - i * 5, 0.6, this.sfxBus);
          this.noise(t + i * 0.14, 0.1, 220, 1, 0.35, "lowpass");
        }
        this.tone(t + 0.45, 0.5, 130, "sawtooth", 0.25, { endFreq: 55 });
        break;
      }
      case "twang":
        this.banjo(t, 45, 0.7, this.sfxBus);
        this.banjo(t + 0.02, 52, 0.6, this.sfxBus);
        break;
      case "jugThrow":
        this.noise(t, 0.12, 800, 1.4, 0.12);
        break;
      case "jugSmash": {
        this.noise(t, 0.2, 3400, 1.8, 0.3);
        this.noise(t + 0.03, 0.5, 500, 0.8, 0.25, "lowpass");
        break;
      }
      case "scattergun": {
        this.noise(t, 0.16, 900, 0.7, 0.45, "lowpass");
        this.noise(t, 0.08, 3000, 1.2, 0.28);
        break;
      }
      case "windStrain": {
        // the last pips of wind: a thin wheeze under the jump (pitch rises
        // as the meter empties). Sample if public/sounds/wind-strain.mp3
        // exists, else a synth wheeze.
        if (this.playSample("windStrain", t, pitch, pan)) break;
        this.noise(t, 0.22, 1500 * pitch, 1.4, 0.09, "bandpass");
        this.tone(t + 0.02, 0.18, 1100 * pitch, "sine", 0.035, { endFreq: 1500 * pitch, attack: 0.05 });
        break;
      }
      case "wetfart":
        // Granny Mae gassed out: public/sounds/wetfart.mp3, else the
        // generic whiff below.
        if (this.playSample("wetfart", t, pitch, pan)) break;
      // falls through
      case "windFail": {
        // gassed out: the hiccup that ate the double jump. Sample if
        // public/sounds/wind-fail.mp3 exists, else the game's own hic (the
        // cute burp) plus a sad little sputter.
        if (this.playSample("windFail", t, pitch, pan)) break;
        this.burp(t, pan);
        this.tone(t, 0.09, 520 * pitch, "square", 0.1, { endFreq: 260 * pitch, attack: 0.003 });
        this.tone(t + 0.1, 0.28, 240 * pitch, "sawtooth", 0.12, {
          endFreq: 110 * pitch,
          vibratoHz: 9,
          vibratoCents: 70,
        });
        this.noise(t + 0.08, 0.12, 900, 1.2, 0.06);
        break;
      }
      case "possum":
        this.tone(t, 0.12, 700, "square", 0.08, { endFreq: 1100 });
        break;
      case "boing":
      case "boingSmall": {
        // jaw harp: comb-ish square with wobble
        this.tone(t, 0.28, 140 * pitch, "square", 0.2, {
          endFreq: 200 * pitch,
          vibratoHz: 11,
          vibratoCents: 90,
        });
        break;
      }
      case "scrub":
        this.noise(t, 0.06, 4200 * pitch, 2.4, 0.16);
        break;
      case "cluck":
        this.tone(t, 0.07, 780 * pitch, "square", 0.12, { endFreq: 520 * pitch });
        this.tone(t + 0.09, 0.1, 620 * pitch, "square", 0.1, { endFreq: 880 * pitch });
        break;
      case "eggPop":
        this.noise(t, 0.08, 1400, 2, 0.2);
        break;
      case "spit":
        this.noise(t, 0.1, 600, 1.6, 0.14, "bandpass");
        this.tone(t, 0.08, 240, "sine", 0.1, { endFreq: 120 });
        break;
      case "boltHit": {
        this.noise(t, 0.16, 5200, 1, 0.3, "highpass");
        this.tone(t, 0.2, 1600, "sawtooth", 0.14, { endFreq: 200 });
        break;
      }
      case "cousinYell":
        this.tone(t, 0.2, 300 * pitch, "sawtooth", 0.14, { endFreq: 480 * pitch });
        break;
      case "cousinBonk":
        // skull meets wall: dull thud + a wobbly little daze tone
        this.noise(t, 0.06, 500 * pitch, 1.2, 0.22);
        this.tone(t, 0.08, 140 * pitch, "square", 0.18, { endFreq: 70 * pitch });
        this.tone(t + 0.1, 0.22, 520 * pitch, "triangle", 0.07, { endFreq: 440 * pitch });
        break;
      case "houndBark": {
        this.tone(t, 0.1, 260, "sawtooth", 0.22, { endFreq: 170 });
        this.tone(t + 0.14, 0.1, 300, "sawtooth", 0.2, { endFreq: 180 });
        break;
      }
      case "howl":
        this.tone(t, 0.9, 320, "sawtooth", 0.2, { endFreq: 480, vibratoHz: 6, vibratoCents: 40 });
        break;
      case "thwack":
        this.noise(t, 0.05, 1000 * pitch, 1.5, 0.15);
        break;
      case "weaponKill":
        this.noise(t, 0.08, 1600 * pitch, 2, 0.2);
        this.tone(t, 0.1, 340 * pitch, "triangle", 0.16, { endFreq: 520 * pitch });
        break;
      case "charge":
        this.tone(t, 0.24, 160, "sawtooth", 0.14, { endFreq: 340 });
        break;
      case "enemyShoot":
        this.tone(t, 0.12, 520, "square", 0.1, { endFreq: 260 });
        break;
      case "moonshineFlood":
        this.noise(t, 0.9, 400, 0.8, 0.3, "lowpass");
        this.noise(t, 0.5, 2600, 1.4, 0.14);
        break;
      case "lightninJar": {
        this.noise(t, 0.3, 6000, 1, 0.4, "highpass");
        this.tone(t, 0.4, 2000, "sawtooth", 0.2, { endFreq: 120 });
        break;
      }
      case "fart":
        // Granny Mae's scoot: public/sounds/fart.mp3, else a low skunk rip
        if (this.playSample("fart", t, pitch, pan)) break;
        pitch *= 0.75;
      // falls through
      case "skunk":
        this.noise(t, 0.7, 300 * pitch, 0.6, 0.2, "lowpass");
        this.tone(t, 0.5, 90 * pitch, "sine", 0.15, { endFreq: 60 * pitch });
        break;
      case "hogSqueal": {
        // hog stampede popping: public/sounds/pigsqueal.mp3, else synth
        if (this.playSample("hogSqueal", t, pitch, pan)) break;
        this.tone(t, 0.35, 900, "sawtooth", 0.24, { endFreq: 1500, vibratoHz: 14, vibratoCents: 120 });
        this.tone(t + 0.4, 0.3, 700, "sawtooth", 0.2, { endFreq: 400 });
        break;
      }
      case "boom": {
        this.noise(t, 0.5, 240, 0.6, 0.5, "lowpass");
        this.tone(t, 0.3, 120, "square", 0.25, { endFreq: 45 });
        break;
      }
      case "bossHit":
        this.noise(t, 0.14, 700, 1, 0.3, "lowpass");
        this.tone(t, 0.16, 220, "square", 0.2, { endFreq: 110 });
        break;
      case "bossPhase": {
        this.tone(t, 0.7, 80, "sawtooth", 0.3, { endFreq: 160 });
        this.noise(t, 0.6, 400, 0.8, 0.3, "lowpass");
        break;
      }
      case "bossDown":
      case "bossDefeat": {
        const notes = [45, 52, 57, 61, 64, 69];
        notes.forEach((n, i) => this.banjo(t + i * 0.08, n, 0.6, this.sfxBus));
        this.noise(t, 0.8, 300, 0.7, 0.35, "lowpass");
        break;
      }
      case "minionSpawn":
        this.tone(t, 0.14, 400, "triangle", 0.1, { endFreq: 620 });
        break;
      case "wallSlam":
        this.noise(t, 0.25, 180, 0.8, 0.4, "lowpass");
        break;
      case "splash":
        this.noise(t, 0.4, 900, 0.9, 0.25, "bandpass");
        break;
      case "teleport":
        this.tone(t, 0.2, 1200, "sine", 0.12, { endFreq: 300 });
        break;
      case "kernelBounce":
        this.tone(t, 0.18, 140, "sine", 0.3, { endFreq: 70 });
        break;
      case "vineWhip":
        this.noise(t, 0.14, 2000, 1.2, 0.2);
        break;
      case "meltdown":
        this.tone(t, 0.9, 60, "sawtooth", 0.35, { endFreq: 200 });
        break;
      case "cowFling":
        this.tone(t, 0.4, 420, "sawtooth", 0.18, { endFreq: 240, vibratoHz: 7, vibratoCents: 60 });
        break;
      case "devilFiddle":
        this.fiddleNoteSfx(t, 64, 0.3);
        this.fiddleNoteSfx(t + 0.1, 70, 0.3);
        break;
      case "duelNote":
        this.fiddleNoteSfx(t, 76, 0.25);
        break;
      case "noteReturn":
        this.banjo(t, 69 + Math.round((pitch - 1) * 10), 0.7, this.sfxBus);
        break;
      case "noteHit":
        this.banjo(t, 81, 0.6, this.sfxBus);
        break;
      // Buford's Fishin' Line
      case "castLine":
        // whip of the cane pole + reel click
        this.noise(t, 0.12, 2600 * pitch, 1.4, 0.16);
        this.tone(t + 0.02, 0.05, 1800, "square", 0.05, { endFreq: 900 });
        break;
      case "lineTaut":
        // line snaps tight: low twang
        this.tone(t, 0.12, 180, "triangle", 0.22, { endFreq: 120 });
        this.banjo(t, 50, 0.35, this.sfxBus);
        break;
      case "lineSlack":
        this.noise(t, 0.06, 1400, 2, 0.08);
        break;
      case "hookBite":
        this.tone(t, 0.1, 300, "sawtooth", 0.18, { endFreq: 140 });
        this.noise(t, 0.08, 800, 1.5, 0.18, "bandpass");
        break;
      case "fling":
        // rising whoosh as the varmint sails
        this.noise(t, 0.3, 600 * pitch, 1.2, 0.2, "bandpass");
        this.tone(t, 0.28, 260 * pitch, "triangle", 0.12, { endFreq: 720 * pitch });
        break;
      case "levelClear": {
        const tag = [57, 61, 64, 69];
        tag.forEach((n, i) => this.banjo(t + i * 0.07, n, 0.5, this.sfxBus));
        break;
      }
      default:
        this.noise(t, 0.05, 1200, 2, 0.08);
    }
  }

  private fiddleNoteSfx(when: number, midi: number, dur: number): void {
    this.tone(when, dur, midiToFreq(midi), "sawtooth", 0.14, {
      vibratoHz: 6,
      vibratoCents: 25,
    });
  }

  private gospelChord(when: number, midis: number[], dur: number, gain: number): void {
    for (const m of midis) {
      this.tone(when, dur, midiToFreq(m), "sawtooth", gain / midis.length, {
        attack: 0.2,
        detune: 6,
      });
      this.tone(when, dur, midiToFreq(m), "sawtooth", gain / midis.length, {
        attack: 0.25,
        detune: -7,
      });
    }
  }

  // ------------------------------------------------------------ level music

  /** Called once per sim tick from the host. Rolls a fresh random track
   *  whenever the level index changes and keeps it looping until then. */
  tickMusic(sim: Sim): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;

    if (sim.levelIndex !== this.trackLevel) {
      this.trackLevel = sim.levelIndex;
      // re-roll once on a repeat so back-to-back levels usually differ
      let idx = Math.floor(Math.random() * MUSIC_TRACKS.length);
      if (idx === this.lastTrackIdx) idx = Math.floor(Math.random() * MUSIC_TRACKS.length);
      this.lastTrackIdx = idx;

      if (!this.trackEl) {
        this.trackEl = new Audio();
        this.trackEl.loop = true;
        const node = ctx.createMediaElementSource(this.trackEl);
        node.connect(this.musicBus);
      }
      this.trackEl.src = `${import.meta.env.BASE_URL}music/${encodeURIComponent(MUSIC_TRACKS[idx])}`;
    }

    // keep nudging play: covers autoplay rejection before the first gesture
    const el = this.trackEl;
    if (el && el.paused && !this.trackPlayPending) {
      this.trackPlayPending = true;
      el.play().then(
        () => (this.trackPlayPending = false),
        () => (this.trackPlayPending = false),
      );
    }
  }

  stopMusic(): void {
    this.trackLevel = -1;
    this.trackEl?.pause();
  }
}

export const audio = new JugBandAudio();
