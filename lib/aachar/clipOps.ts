// AA character pipeline — derived clips (Phase 6).
//
// SPUM's set contains five hand-authored derivatives, and its own catalog warns
// that regenerating a parent without its children desyncs them
// (`lib/spum/catalog.ts:706-742`):
//
//     throw            ⊂ axe_attack        (truncation)
//     give             = reverse(receive)
//     givereceive      = give + receive    (concatenation, seam deduped)
//     getup            = reverse(death_sleep)
//     move_carry*      = move legs + greeting2 arms
//
// Here those relationships are FUNCTIONS rather than copies, so the desync is
// structurally impossible: re-author `receive` and `give` and `givereceive`
// follow on the next build. That is the whole reason this module exists — the
// operations themselves are small.
//
// Every op preserves the invariants `checkClip` enforces: integer frames,
// endpoints at 0 and `frames`, and loop closure.

import {
  AA_CHANNELS,
  type AaBeat,
  type AaChannel,
  type AaClip,
  type AaPose,
  addPoses,
  channelAt,
  scalePose,
} from "./clip";

const clonePose = (p: AaPose | undefined): AaPose =>
  p ? (JSON.parse(JSON.stringify(p)) as AaPose) : {};

/**
 * Exact time reversal. The engine has no reverse playback — `SceneActor`'s
 * `speed` must be positive — so a backwards clip has to exist as data.
 *
 * Reversing keeps the frame GRID intact by mapping each beat to
 * `frames - frame`, which is integral whenever the input is. Roles are
 * remapped too: an anticipation played backwards is a settle, a strike is a
 * strike.
 */
export function reverseClip(clip: AaClip, name: string): AaClip {
  const flip: Partial<Record<AaBeat["role"], AaBeat["role"]>> = {
    anticipate: "settle",
    settle: "anticipate",
    overshoot: "overshoot",
  };
  return {
    name,
    frames: clip.frames,
    loop: clip.loop,
    rest: clonePose(clip.rest),
    note: `reverse of ${clip.name}`,
    beats: clip.beats
      .map((b) => ({
        frame: clip.frames - b.frame,
        role: flip[b.role] ?? b.role,
        pose: clonePose(b.pose),
        ...(b.note ? { note: b.note } : {}),
      }))
      .reverse(),
  };
}

/**
 * Play clips back to back. The seam key is DEDUPED when the two poses meet
 * exactly — otherwise the joined clip would carry two keyframes at the same
 * time, and `findSegment` would resolve a zero-length span there.
 *
 * Every clip must share a `rest` posture, since the result can only carry one.
 * Rather than silently picking the first, differing rests are FOLDED into each
 * segment's beats, which is exact.
 */
export function concatClips(clips: AaClip[], name: string): AaClip {
  if (clips.length === 0) throw new Error("concatClips needs at least one clip");
  const rest = clonePose(clips[0].rest);
  const beats: AaBeat[] = [];
  let offset = 0;

  for (const clip of clips) {
    // Fold this segment's own rest posture in as a per-beat delta, relative to
    // the rest the joined clip will carry.
    const delta = addPoses(clip.rest, scalePose(rest, -1));
    for (const b of clip.beats) {
      const frame = offset + b.frame;
      const pose = addPoses(b.pose, delta);
      const last = beats[beats.length - 1];
      if (last && last.frame === frame) {
        // Seam: keep the incoming pose only if it actually differs, so a clean
        // hand-off contributes one key rather than two at the same instant.
        last.pose = pose;
        continue;
      }
      beats.push({ frame, role: b.role, pose, ...(b.note ? { note: b.note } : {}) });
    }
    offset += clip.frames;
  }

  return {
    name,
    frames: offset,
    loop: clips[0].loop && clips[clips.length - 1].loop,
    rest,
    beats,
    note: `${clips.map((c) => c.name).join(" + ")}`,
  };
}

/**
 * Keep this clip's timing and everything else, but LOCK the named channels to
 * one constant pose. How `move_carry_loop` is built: the legs and body bob keep
 * walking, the arms hold whatever they are carrying.
 *
 * The held pose is a delta over stance+rest, same as any beat, so a carry pose
 * authored once reads correctly against any stance.
 */
export function holdChannels(
  clip: AaClip,
  channels: AaChannel[],
  held: AaPose,
  name: string,
): AaClip {
  const set = new Set(channels);
  return {
    name,
    frames: clip.frames,
    loop: clip.loop,
    rest: clonePose(clip.rest),
    note: `${clip.name} with ${channels.join("/")} held`,
    beats: clip.beats.map((b) => {
      const pose: AaPose = {};
      for (const ch of AA_CHANNELS) {
        if (set.has(ch)) {
          if (held[ch]) pose[ch] = { ...held[ch] };
        } else if (b.pose[ch]) {
          pose[ch] = { ...b.pose[ch] };
        }
      }
      return { frame: b.frame, role: b.role, pose, ...(b.note ? { note: b.note } : {}) };
    }),
  };
}

/**
 * The one-shot companion to `holdChannels`: the named channels RAMP from their
 * clip pose into `target` over the first `overFrames`, then hold. Reads as
 * moving into a carry rather than already being in one.
 *
 * A beat is inserted at `overFrames` if none exists there, so the ramp lands on
 * an authored pose rather than wherever the walk cycle happened to be.
 */
export function rampChannels(
  clip: AaClip,
  channels: AaChannel[],
  target: AaPose,
  overFrames: number,
  name: string,
): AaClip {
  if (!Number.isInteger(overFrames) || overFrames < 1 || overFrames > clip.frames) {
    throw new Error(`rampChannels: overFrames must be an integer in 1..${clip.frames}`);
  }
  const set = new Set(channels);
  const frames = new Set(clip.beats.map((b) => b.frame));
  const source: AaBeat[] = [...clip.beats];
  if (!frames.has(overFrames)) {
    // Sample the walk at the ramp's end so the inserted beat continues the
    // cycle for the channels that are NOT ramping.
    const pose = sampleBeats(clip.beats, overFrames);
    const at = source.findIndex((b) => b.frame > overFrames);
    source.splice(at < 0 ? source.length : at, 0, {
      frame: overFrames,
      role: "settle",
      pose,
    });
  }

  return {
    name,
    // A ramp breaks loop closure by construction — the arms end somewhere the
    // clip did not start. Marking it non-looping is the honest answer; chain
    // into the held variant for the sustained version.
    loop: false,
    frames: clip.frames,
    rest: clonePose(clip.rest),
    note: `${clip.name}, ${channels.join("/")} ramping to a hold over ${overFrames}f`,
    beats: source.map((b) => {
      const pose: AaPose = {};
      for (const ch of AA_CHANNELS) {
        if (set.has(ch)) {
          const u = Math.min(1, b.frame / overFrames);
          const from = channelAt(b.pose, ch);
          const to = channelAt(target, ch);
          pose[ch] = {
            rot: from.rot + (to.rot - from.rot) * u,
            x: from.x + (to.x - from.x) * u,
            y: from.y + (to.y - from.y) * u,
          };
        } else if (b.pose[ch]) {
          pose[ch] = { ...b.pose[ch] };
        }
      }
      return { frame: b.frame, role: b.role, pose, ...(b.note ? { note: b.note } : {}) };
    }),
  };
}

/** Linear sample of a beat list at an arbitrary frame — the same interpolation
 *  the engine performs, so an inserted beat lands exactly where the clip
 *  already was. */
export function sampleBeats(beats: AaBeat[], frame: number): AaPose {
  if (beats.length === 0) return {};
  if (frame <= beats[0].frame) return clonePose(beats[0].pose);
  const last = beats[beats.length - 1];
  if (frame >= last.frame) return clonePose(last.pose);
  let i = 0;
  while (i < beats.length - 1 && beats[i + 1].frame < frame) i++;
  const a = beats[i];
  const b = beats[i + 1];
  const span = b.frame - a.frame;
  const u = span === 0 ? 0 : (frame - a.frame) / span;
  const out: AaPose = {};
  for (const ch of AA_CHANNELS) {
    if (!a.pose[ch] && !b.pose[ch]) continue;
    const va = channelAt(a.pose, ch);
    const vb = channelAt(b.pose, ch);
    out[ch] = {
      rot: va.rot + (vb.rot - va.rot) * u,
      x: va.x + (vb.x - va.x) * u,
      y: va.y + (vb.y - va.y) * u,
    };
  }
  return out;
}

/**
 * Cut a clip down to its first `frames`, sampling a closing beat if the cut
 * lands between beats. How SPUM's `throw` was made from `axe_attack` — the
 * second overhead chop is simply dropped.
 */
export function truncateClip(clip: AaClip, frames: number, name: string): AaClip {
  if (!Number.isInteger(frames) || frames < 1 || frames > clip.frames) {
    throw new Error(`truncateClip: frames must be an integer in 1..${clip.frames}`);
  }
  const beats = clip.beats.filter((b) => b.frame < frames).map((b) => ({ ...b, pose: clonePose(b.pose) }));
  const existing = clip.beats.find((b) => b.frame === frames);
  beats.push(
    existing
      ? { frame: frames, role: existing.role, pose: clonePose(existing.pose) }
      : { frame: frames, role: "settle", pose: sampleBeats(clip.beats, frames) },
  );
  return {
    name,
    frames,
    loop: false,
    rest: clonePose(clip.rest),
    beats,
    note: `${clip.name} truncated to ${frames}f`,
  };
}
