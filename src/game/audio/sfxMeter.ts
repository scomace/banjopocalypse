// Objective loudness for the mixer (/admin/sfx): render one SFX into an
// OfflineAudioContext through a private JugBandAudio (same graph as the game:
// voice trim -> sfx bus -> master -> compressor) and measure what comes out.
//
// Numbers are dBFS. `loud` is the honest proxy for "how loud does this hit":
// the RMS of the loudest 100 ms window, so a 50 ms click and a 2 s chord are
// compared by their body rather than by how much silence follows them. It is
// not LUFS (no K-weighting), so treat suggestions as a first pass for ears
// to finish: high thin sounds read louder than these numbers say, deep
// rumbles quieter.

import { JugBandAudio } from "./engine";

export type SfxMeasure = {
  name: string;
  pitch: number;
  /** RMS of the loudest 100 ms window, dBFS (-Infinity if silent). */
  loud: number;
  /** RMS over the whole audible body, dBFS. */
  body: number;
  /** sample peak, dBFS */
  peak: number;
  /** audible length in seconds (first to last sample above -60 dBFS) */
  seconds: number;
};

const RENDER_SECONDS = 3.2;
const SAMPLE_RATE = 48000;
const WINDOW = 0.1;
const HOP = 0.01;

export const dB = (lin: number): number => (lin > 0 ? 20 * Math.log10(lin) : -Infinity);
export const fromDb = (db: number): number => Math.pow(10, db / 20);

let donor: Promise<JugBandAudio> | null = null;

/** One engine that fetched + decoded the samples; render engines adopt them. */
function sampleDonor(): Promise<JugBandAudio> {
  if (!donor) {
    donor = (async () => {
      const eng = new JugBandAudio(new OfflineAudioContext(1, 1, SAMPLE_RATE));
      await eng.ready;
      return eng;
    })();
  }
  return donor;
}

/** Render `name` at `pitch` with `trims` applied and measure the result. */
export async function measureSfx(
  name: string,
  pitch: number,
  trims: Record<string, number>,
): Promise<SfxMeasure> {
  const off = new OfflineAudioContext(2, Math.floor(RENDER_SECONDS * SAMPLE_RATE), SAMPLE_RATE);
  const eng = new JugBandAudio(off);
  eng.adoptSamples(await sampleDonor());
  eng.setTrims(trims);
  eng.playSfx(name, pitch, 0.02);
  const buf = await off.startRendering();
  return { name, pitch, ...analyse(buf) };
}

export function analyse(buf: AudioBuffer): Omit<SfxMeasure, "name" | "pitch"> {
  const n = buf.length;
  const mono = new Float32Array(n);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) mono[i] += d[i] / buf.numberOfChannels;
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(mono[i]));
  const floor = fromDb(-60);
  let first = 0;
  while (first < n && Math.abs(mono[first]) < floor) first++;
  let last = n - 1;
  while (last > first && Math.abs(mono[last]) < floor) last--;
  if (first >= last) return { loud: -Infinity, body: -Infinity, peak: dB(peak), seconds: 0 };

  let sum = 0;
  for (let i = first; i <= last; i++) sum += mono[i] * mono[i];
  const body = Math.sqrt(sum / (last - first + 1));

  // sliding 100 ms RMS via prefix sums of squares
  const sr = buf.sampleRate;
  const win = Math.max(1, Math.floor(WINDOW * sr));
  const hop = Math.max(1, Math.floor(HOP * sr));
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + mono[i] * mono[i];
  let loudest = 0;
  for (let s = Math.max(0, first - win); s + win <= n && s <= last; s += hop) {
    const ms = (prefix[s + win] - prefix[s]) / win;
    if (ms > loudest) loudest = ms;
  }
  return {
    loud: dB(Math.sqrt(loudest)),
    body: dB(body),
    peak: dB(peak),
    seconds: (last - first + 1) / sr,
  };
}

/**
 * Trim that would move a measured sound onto `targetDb` (by its `loud`),
 * given the trim it was measured with. Null when the sound was silent.
 */
export function suggestTrim(m: SfxMeasure, currentTrim: number, targetDb: number): number | null {
  if (!Number.isFinite(m.loud)) return null;
  return currentTrim * fromDb(targetDb - m.loud);
}
