// BANJOPOCALYPSE stub. The accountingsurvivor LibraryBrowser browses that
// repo's third-party asset packs (propCatalog/spriteCatalog, ~3.5 MB of data
// that is deliberately NOT ported). BANJOPOCALYPSE authors parts from scratch
// in PartCanvas instead, so this panel just says so. The exported types keep
// SlotEditor compiling unchanged.

export type LibraryPick = {
  /** Image URL the art loads from (public path). */
  url: string;
  /** Sprite sheets only: the frame rect to crop, in sheet px. */
  frame?: { x: number; y: number; width: number; height: number };
  label: string;
  /** Provenance recorded on the part. */
  source: string;
  /** A valid part-name seed derived from the item's own name. */
  suggestedName: string;
};

export type ImportMode = "asis" | "pixelate";

export function suggestNameFrom(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

type Props = {
  onPick: (pick: LibraryPick, mode: ImportMode) => void;
  onClose: () => void;
};

export function LibraryBrowser({ onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-96 rounded bg-white p-6 shadow-xl">
        <div className="mb-2 text-sm font-bold">Library browser not ported</div>
        <p className="mb-4 text-xs text-slate-600">
          BANJOPOCALYPSE has no third-party asset packs; all sprites are
          original. Draw parts directly in the part editor instead.
        </p>
        <button
          onClick={onClose}
          className="rounded bg-slate-900 px-3 py-1 text-xs text-white"
        >
          Close
        </button>
      </div>
    </div>
  );
}
