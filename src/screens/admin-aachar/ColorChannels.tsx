"use client";

// AA part editor — tagging which palette entries a character may recolour.
//
// The rule this panel exists to express: art is drawn in its REAL colours and
// then tagged. Nothing is painted a sentinel white or magenta, so the part
// reads correctly here, and the ramp survives the swap — recolouring maps each
// tagged shade to the same position in a ramp built around the target
// (lib/aachar/recolor.ts). An untagged colour is never touched, which is how an
// outline stays put while the fill under it changes.
//
// Two channels is the shape most parts want: a shirt body and its trim. A part
// that only ever needs one colour changed declares one, and a character that
// picks nothing for a channel renders it exactly as drawn.

import { suggestChannelId } from "@/lib/aachar/character";
import {
  DEFAULT_PROTECT_LIGHTNESS,
  channelConflicts,
  channelRamp,
  countRampPixels,
  isProtected,
  lightnessOf,
  nearbyColors,
  normalizeHex,
  protectLightness,
  setChannelBase,
  toggleRampColor,
  type PaletteEntry,
} from "@/lib/aachar/recolor";
import type { AaColorChannel, AaProtect } from "@/lib/aachar/types";

// Perceptual radius for "tag the near-duplicates too" — in OKLab units, about
// one shading step. Imported art arrives with colours a downsample invented,
// and tagging them one at a time is how a recolour ends up speckled.
const NEAR_EPSILON = 0.05;

// Ordering a ramp by lightness is only cosmetic, but it turns the swatch strip
// into the thing an artist actually reads: dark to light, in order.
function byLightness(a: string, b: string): number {
  const lum = (hex: string) => {
    const h = hex.slice(1);
    return (
      0.2126 * parseInt(h.slice(0, 2), 16) +
      0.7152 * parseInt(h.slice(2, 4), 16) +
      0.0722 * parseInt(h.slice(4, 6), 16)
    );
  };
  return lum(a) - lum(b);
}

type Props = {
  channels: AaColorChannel[];
  onChange: (next: AaColorChannel[]) => void;
  /** Distinct colours in the working canvas, most-used first. */
  palette: PaletteEntry[];
  /** Which channel a canvas tag lands in. */
  armed: string | null;
  onArm: (id: string | null) => void;
  /** Preview colour — not saved; just answers "what would blue look like". */
  testColor: string;
  onTestColor: (hex: string) => void;
  /** Pixel buffer, for the "0 pixels" staleness warning. */
  pixels: Uint8ClampedArray;
  protect: AaProtect | undefined;
  onProtectChange: (next: AaProtect | undefined) => void;
};

export function ColorChannels({
  channels,
  onChange,
  palette,
  armed,
  onArm,
  testColor,
  onTestColor,
  pixels,
  protect,
  onProtectChange,
}: Props) {
  const conflicts = channelConflicts(channels);
  const armedChannel = channels.find((c) => c.id === armed) ?? null;
  const tagged = new Set(channels.flatMap((c) => c.ramp.map(normalizeHex)));

  const update = (id: string, next: AaColorChannel | null) => {
    onChange(
      next
        ? channels.map((c) => (c.id === id ? next : c))
        : channels.filter((c) => c.id !== id),
    );
  };

  const addChannel = () => {
    // "primary" then "secondary" — the two a cloth wants. Anything past that
    // is named by count, because there's no idiom for a third.
    const base = channels.length === 0 ? "primary" : channels.length === 1 ? "secondary" : "accent";
    const id = suggestChannelId(channels, base);
    onChange([...channels, { id, ramp: [], base: "#000000" } as AaColorChannel]);
    onArm(id);
  };

  const toggle = (hex: string) => {
    if (!armedChannel) return;
    update(armedChannel.id, toggleRampColor(armedChannel, hex));
  };

  const addNear = (hex: string) => {
    if (!armedChannel) return;
    let next: AaColorChannel = armedChannel;
    for (const near of nearbyColors(palette, hex, NEAR_EPSILON)) {
      if (next.ramp.map(normalizeHex).includes(normalizeHex(near))) continue;
      next = toggleRampColor(next, near) ?? next;
    }
    update(armedChannel.id, next);
  };

  return (
    <section className="rounded border border-slate-300 bg-white p-3">
      <h2 className="mb-1 text-sm font-semibold">Colour channels</h2>
      <p className="mb-2 text-xs text-slate-500">
        Tag the shades a character may change. Draw in real colours — the ramp is
        remapped, not flattened, so shading survives. Untagged colours (outlines,
        skin) never move.
      </p>

      {channels.length === 0 ? (
        <p className="mb-2 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">
          None yet — this part renders exactly as drawn.
        </p>
      ) : null}

      {channels.map((channel) => {
        const isArmed = channel.id === armed;
        const covered = countRampPixels(pixels, channel.ramp);
        const ramp = [...channel.ramp].sort(byLightness);
        const preview = channelRamp({ ...channel, ramp }, testColor);
        return (
          <div
            key={channel.id}
            className={`mb-2 rounded border p-2 ${
              isArmed ? "border-emerald-500 bg-emerald-50" : "border-slate-200"
            }`}
          >
            <div className="flex items-center gap-1">
              <input
                value={channel.label ?? channel.id}
                onChange={(e) =>
                  update(channel.id, { ...channel, label: e.target.value })
                }
                className="w-24 rounded border border-slate-300 px-1 py-0.5 text-xs"
                title="Shown next to the colour picker in the Characters tab"
              />
              <code className="text-xs text-slate-400">{channel.id}</code>
              <button
                onClick={() => onArm(isArmed ? null : channel.id)}
                className={`ml-auto rounded px-2 py-0.5 text-xs ${
                  isArmed
                    ? "bg-emerald-600 text-white"
                    : "border border-slate-300 hover:bg-slate-50"
                }`}
              >
                {isArmed ? "tagging" : "tag into"}
              </button>
              <button
                onClick={() => update(channel.id, null)}
                className="rounded border border-red-300 px-1.5 py-0.5 text-xs text-red-700 hover:bg-red-50"
                title="Remove this channel"
              >
                ×
              </button>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-0.5">
              {ramp.map((hex) => (
                <button
                  key={hex}
                  onClick={() => update(channel.id, setChannelBase(channel, hex))}
                  style={{ background: hex }}
                  className={`h-6 w-6 rounded-sm border ${
                    normalizeHex(channel.base) === hex
                      ? "border-2 border-slate-900"
                      : "border-slate-300"
                  }`}
                  title={`${hex}${
                    normalizeHex(channel.base) === hex
                      ? " — base (the shade the picked colour replaces)"
                      : " — click to make this the base"
                  }`}
                />
              ))}
              {ramp.length > 0 ? (
                <>
                  <span className="px-1 text-xs text-slate-400">→</span>
                  {preview.map((hex, i) => (
                    <span
                      key={`${hex}-${i}`}
                      style={{ background: hex }}
                      className="h-6 w-6 rounded-sm border border-slate-300"
                      title={hex}
                    />
                  ))}
                </>
              ) : null}
            </div>

            <p className="mt-1 text-xs text-slate-500">
              {ramp.length} shade{ramp.length === 1 ? "" : "s"}, {covered}px
              {covered === 0 && ramp.length > 0 ? (
                <span className="ml-1 rounded bg-red-100 px-1 text-red-800">
                  matches nothing on the canvas — re-shaded since it was tagged?
                </span>
              ) : null}
              {ramp.length > 0 && !ramp.includes(normalizeHex(channel.base)) ? (
                <span className="ml-1 rounded bg-amber-100 px-1 text-amber-800">
                  base {normalizeHex(channel.base)} isn&apos;t in the ramp —
                  picks will drift; click a swatch above to anchor it
                </span>
              ) : null}
            </p>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={addChannel}
          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
        >
          + Channel
        </button>
        <label className="flex items-center gap-1 text-xs text-slate-600">
          Try
          <input
            type="color"
            value={testColor}
            onChange={(e) => onTestColor(e.target.value)}
            className="h-6 w-8 rounded border border-slate-300"
          />
        </label>
      </div>

      {armedChannel ? (
        <>
          <p className="mt-2 text-xs text-emerald-800">
            Click a colour below (or use the <strong>tag</strong> tool on the
            canvas) to add or remove it from <strong>{armedChannel.label ?? armedChannel.id}</strong>.
          </p>
          <div className="mt-1 flex flex-wrap gap-0.5">
            {palette.map((entry) => {
              const mine = armedChannel.ramp
                .map(normalizeHex)
                .includes(entry.hex);
              const other = !mine && tagged.has(entry.hex);
              return (
                <button
                  key={entry.hex}
                  onClick={() => toggle(entry.hex)}
                  onDoubleClick={() => addNear(entry.hex)}
                  style={{ background: entry.hex }}
                  className={`h-6 w-6 rounded-sm ${
                    mine
                      ? "border-2 border-emerald-600"
                      : other
                        ? "border-2 border-dashed border-slate-500"
                        : "border border-slate-300"
                  }`}
                  title={`${entry.hex} — ${entry.count}px${
                    other ? " (tagged in another channel)" : ""
                  }. Double-click to add its near-duplicates too.`}
                />
              );
            })}
          </div>
          {palette.length === 0 ? (
            <p className="mt-1 text-xs text-slate-500">Nothing drawn yet.</p>
          ) : null}
        </>
      ) : channels.length > 0 ? (
        <p className="mt-2 text-xs text-slate-500">
          Pick <em>tag into</em> on a channel to start adding colours to it.
        </p>
      ) : null}

      {conflicts.length > 0 ? (
        <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-900">
          In two channels at once — the first one listed wins, so the second
          silently won&apos;t recolour these: {conflicts.join(", ")}
        </p>
      ) : null}

      <ProtectPanel
        protect={protect}
        onChange={onProtectChange}
        palette={palette}
      />
    </section>
  );
}

// What a character's colour picks and appearance sliders must leave alone.
//
// A threshold rather than a hand-tagged list, because "the sliders wrecked my
// outline" has to be wrong by default, not after setup. The panel shows exactly
// which colours the threshold caught, so an over-eager one is visible rather
// than something you discover on the rig.
function ProtectPanel({
  protect,
  onChange,
  palette,
}: {
  protect: AaProtect | undefined;
  onChange: (next: AaProtect | undefined) => void;
  palette: readonly PaletteEntry[];
}) {
  const threshold = protectLightness(protect);
  const explicit = (protect?.colors ?? []).map(normalizeHex);
  const caught = palette.filter((e) => isProtected(e.hex, protect));

  // An all-defaults object is written back as `undefined`, so a part that never
  // touched this stays byte-identical to one saved before protection existed.
  const write = (next: AaProtect) => {
    const clean: AaProtect = {};
    if (next.maxLightness !== undefined && next.maxLightness !== DEFAULT_PROTECT_LIGHTNESS) {
      clean.maxLightness = next.maxLightness;
    }
    if (next.colors && next.colors.length > 0) clean.colors = next.colors;
    onChange(Object.keys(clean).length > 0 ? clean : undefined);
  };

  const toggleExplicit = (hex: string) => {
    const h = normalizeHex(hex);
    const has = explicit.includes(h);
    write({
      maxLightness: threshold,
      colors: has ? explicit.filter((c) => c !== h) : [...explicit, h],
    });
  };

  return (
    <div className="mt-3 border-t border-slate-200 pt-2">
      <h3 className="text-xs font-semibold text-slate-700">
        Protected — the outline
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        Never touched by a character&apos;s colours <em>or</em> its appearance
        sliders. Everything at or below this lightness is protected
        automatically; click a swatch to pin an extra one.
      </p>
      <label className="mt-1 flex items-center gap-2 text-xs text-slate-600">
        Darker than
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(threshold * 100)}
          onChange={(e) =>
            write({ maxLightness: Number(e.target.value) / 100, colors: explicit })
          }
          className="flex-1"
        />
        <code className="w-8 text-right">{threshold.toFixed(2)}</code>
      </label>
      <div className="mt-1 flex flex-wrap gap-0.5">
        {palette.map((entry) => {
          const pinned = explicit.includes(entry.hex);
          const auto = !pinned && isProtected(entry.hex, protect);
          return (
            <button
              key={entry.hex}
              onClick={() => toggleExplicit(entry.hex)}
              style={{ background: entry.hex }}
              className={`h-5 w-5 rounded-sm ${
                pinned
                  ? "border-2 border-slate-900"
                  : auto
                    ? "border-2 border-dotted border-slate-700"
                    : "border border-slate-200 opacity-40"
              }`}
              title={`${entry.hex} — lightness ${lightnessOf(entry.hex).toFixed(2)}${
                pinned ? ", pinned" : auto ? ", under the threshold" : ", not protected"
              }`}
            />
          );
        })}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {caught.length} of {palette.length} protected
        {threshold === 0 && explicit.length === 0 ? (
          <span className="ml-1 rounded bg-amber-100 px-1 text-amber-900">
            nothing is — the sliders will move the outline too
          </span>
        ) : null}
      </p>
    </div>
  );
}
