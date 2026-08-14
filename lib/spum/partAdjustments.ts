// Per-part placement adjustments — offset (source-sprite px) and scale
// applied to every slice of a part wherever it renders (harness, scenes,
// lessons). This is how variably-sized imported art (flaticon hats via
// `npm run part-import`, but also any stock SPUM part) gets fitted to the
// rig without touching its atlas pivot: the renderer looks up
// `PART_ADJUSTMENTS[slot/part]` when building slices.
//
// The map literal between the markers is machine-managed: the /admin/spum
// character editor's per-slot "Save default" button POSTs to the dev-server
// endpoint in `scripts/vite-part-adjust-plugin.ts`, which rewrites the JSON
// block. Hand-edits are fine too (keep it valid JSON, keys sorted by the
// plugin on next save).

// The four placement scalars. Used both as a part's base adjustment and as a
// per-stamp delta layered on top of it (see `perBone`).
export type PartNudge = {
  // Source-sprite pixels; +dx moves the sprite right, +dy moves it up
  // (same convention as `--nudge` in scripts/custom-part-import.ts).
  dx?: number;
  dy?: number;
  // Per-axis multipliers on the part's native pixel size around its pivot,
  // in the sprite's own frame (a rotated bone squishes along the sprite's
  // width/height, not screen axes). 1 = native; set both for uniform scale,
  // one for squish/stretch.
  scaleX?: number;
  scaleY?: number;
  // Rotation about the slice's pivot, degrees, + = clockwise on screen (when
  // no ancestor bone is rotated). Applied OUTSIDE the flip, so the on-screen
  // direction is the same whether or not the slice is mirrored.
  rot?: number;
  // Mirror the slice horizontally about its pivot. dx keeps its screen
  // meaning under a flip (+dx still moves the art right) — the renderer
  // negates the pivot fold, not the author's number.
  flipX?: boolean;
};

export type PartAdjustment = PartNudge & {
  // Per-stamp deltas for slots whose region renders on MORE THAN ONE bone.
  // Today that's only `eye`: its Back/Front regions each stamp twice, onto
  // P_LEye (index 0) then P_REye (index 1), at bone positions SPUM hardcodes
  // 5 source px apart. `perBone` is how an author breaks that symmetry —
  // spacing, height, and size of each eye independently.
  //
  // Composed ON TOP of the base nudge above: offsets add, scales multiply.
  // Ignored by single-bone slots and by free-layer eyes (one stamp, nothing
  // to differentiate). Sparse entries are fine — `perBone: [undefined, {dy:1}]`
  // nudges only the right eye.
  perBone?: (PartNudge | undefined)[];
};

// Layer a per-stamp delta onto a base nudge: offsets and rotations add,
// scales multiply, flips cancel in pairs. Returns `base` unchanged when
// there's no delta so the common path doesn't allocate.
export function composeNudge(
  base: PartNudge | undefined,
  delta: PartNudge | undefined,
): PartNudge | undefined {
  if (!delta || isIdentityNudge(delta)) return base;
  return {
    dx: (base?.dx ?? 0) + (delta.dx ?? 0),
    dy: (base?.dy ?? 0) + (delta.dy ?? 0),
    scaleX: (base?.scaleX ?? 1) * (delta.scaleX ?? 1),
    scaleY: (base?.scaleY ?? 1) * (delta.scaleY ?? 1),
    rot: (base?.rot ?? 0) + (delta.rot ?? 0),
    flipX: (base?.flipX ?? false) !== (delta.flipX ?? false),
  };
}

export function isIdentityNudge(n: PartNudge | undefined): boolean {
  if (!n) return true;
  return (
    !n.dx &&
    !n.dy &&
    (n.scaleX === undefined || n.scaleX === 1) &&
    (n.scaleY === undefined || n.scaleY === 1) &&
    !n.rot &&
    !n.flipX
  );
}

export const PART_ADJUSTMENTS: Record<string, PartAdjustment> =
  // part-adjustments:BEGIN
  {
    "helmet/Custom_ChefHat": {
      "dx": -2,
      "dy": 3,
      "scaleY": 0.65
    },
    "helmet/Custom_bowlerhat": {
      "dx": -2,
      "scaleX": 0.8,
      "scaleY": 0.85
    },
    "helmet/Custom_teahat": {
      "dx": -2,
      "dy": 3,
      "scaleX": 0.8,
      "scaleY": 0.6
    },
    "helmet/Custom_test1": {
      "dx": -1,
      "dy": 8,
      "scaleX": 0.55,
      "scaleY": 0.65
    },
    "helmet/Helmet_Archer_2": {
      "dx": -2,
      "scaleX": 0.8,
      "scaleY": 0.85
    }
  }
  // part-adjustments:END
;

// weapon2 shares the weapon catalogue (same PNGs, different bone), so an
// adjustment tuned for a part applies to it in either hand.
export function adjustmentKey(slot: string, part: string): string {
  return `${slot === "weapon2" ? "weapon" : slot}/${part}`;
}

export function isIdentityAdjustment(adj: PartAdjustment | undefined): boolean {
  if (!adj) return true;
  if (!isIdentityNudge(adj)) return false;
  return (adj.perBone ?? []).every(isIdentityNudge);
}

// Effective adjustment for a part: an entry in `overrides` (the editor's
// live-preview state) shadows the checked-in default — including an explicit
// identity `{}`, which is how the editor previews "what would removing the
// saved default look like".
export function resolveAdjustment(
  slot: string,
  part: string,
  overrides?: Record<string, PartAdjustment>,
): PartAdjustment | undefined {
  const key = adjustmentKey(slot, part);
  if (overrides && key in overrides) return overrides[key];
  return PART_ADJUSTMENTS[key];
}
