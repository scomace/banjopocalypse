"use client";

// Thumbnail grid picker for the item slots ("item R" / "item L"). The manifest
// carries 250+ armory items and the Wearing table's dropdown is name-only —
// this modal adds pictures, a search box, and an unbounded scroll (every part
// renders; images lazy-load). Read-only over the model: a pick just sets the
// character's slot pick, exactly like choosing from the dropdown.

import { useMemo, useState } from "react";

import { partsInSlot } from "@/lib/aachar/character";
import { SLOT_LABEL, type AaModel, type AaSlot } from "@/lib/aachar/types";

type Props = {
  model: AaModel;
  slot: AaSlot;
  /** The character's current pick in this slot, if any. */
  current: string | undefined;
  /** Called with the part name, or "" to clear the slot. */
  onPick: (name: string) => void;
  onClose: () => void;
};

function matches(query: string, name: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return terms.every((t) => name.toLowerCase().includes(t));
}

export function ItemPickerModal({ model, slot, current, onPick, onClose }: Props) {
  const [query, setQuery] = useState("");

  const parts = useMemo(
    () => partsInSlot(model, slot).filter((p) => matches(query, p.name)),
    [model, slot, query],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6"
      onClick={onClose}
    >
      <div
        className="flex h-[80vh] w-[720px] max-w-full flex-col rounded border border-slate-300 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-slate-200 p-3">
          <h2 className="text-sm font-semibold">Pick {SLOT_LABEL[slot]}</h2>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search name…"
            className="w-56 rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <span className="text-xs text-slate-500">{parts.length} items</span>
          <button
            onClick={() => {
              onPick("");
              onClose();
            }}
            className="ml-auto rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
          >
            None
          </button>
          <button
            onClick={onClose}
            className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <div className="flex flex-wrap gap-1">
            {parts.map((p) => (
              <button
                key={p.name}
                onClick={() => {
                  onPick(p.name);
                  onClose();
                }}
                title={p.name}
                className={`flex w-16 flex-col items-center rounded border bg-slate-50 pb-0.5 hover:border-emerald-500 ${
                  p.name === current ? "border-emerald-600 ring-1 ring-emerald-500" : "border-slate-300"
                }`}
              >
                <span className="flex h-14 w-14 items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.atlas.image}
                    alt={p.name}
                    loading="lazy"
                    className="max-h-12 max-w-12"
                    style={{ imageRendering: "pixelated" }}
                  />
                </span>
                <span className="w-full truncate px-0.5 text-center text-[10px] leading-tight text-slate-600">
                  {p.name}
                </span>
              </button>
            ))}
          </div>
          {parts.length === 0 ? (
            <p className="text-xs text-slate-500">No items match “{query}”.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
