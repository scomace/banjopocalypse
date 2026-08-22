// Level editor (/admin/levels). See docs/level-editor.md.
//
// Pick any of the 99 levels, paint the 30x17 grid with the game's own tile
// skins, move/resize platform runs, punch floor holes, set the enemy legend
// and per-level overrides, watch the reachability lint, and SAVE A DRAFT:
// src/game/levels/drafts/w4-07.json via the dev server. The authored w{N}.ts
// files are never written from here; drafts are promoted by
// `npm run levels:promote` (or by hand). The Promote button only appears when
// the dev server was started with BANJO_ALLOW_PROMOTE=1.
//
// The working copy autosaves to localStorage per level slot, so a reload
// costs nothing. "Play" opens the game in a new tab with the draft in the
// URL, which works with or without the dev server.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CAST, rescueForLevel } from "../../game/cast";
import { getAuthoredLevelDef } from "../../game/levels";
import {
  absoluteLevelIndex,
  draftId,
  draftsEnabledInGame,
  ENEMY_KINDS,
  ENEMY_LETTERS,
  gridHash,
  levelDefToTs,
  normalizeGrid,
  registerDraft,
  setDraftsEnabledInGame,
  unregisterDraft,
  validateDraft,
  type EnemyLetter,
  type LevelDraft,
} from "../../game/levels/drafts";
import {
  deleteDraftOnServer,
  fetchDraftListing,
  promoteDraftOnServer,
  saveDraftToServer,
  type DraftListing,
} from "../../game/levels/draftsClient";
import type { EnemyKind, LevelDef } from "../../game/levels/types";
import { WORLDS } from "../../game/levels/worlds";
import { GRID_H, GRID_W, HURRY_UP_TICKS, TICK_HZ } from "../../game/sim/constants";
import { GridCanvas, type HoverInfo, type Overlays } from "./GridCanvas";
import { lintLevel, type LintItem } from "./lint";
import {
  deleteRun,
  diffSummary,
  relocateRun,
  TOOLS,
  toolByHotkey,
  type EditorDoc,
  type Grid,
  type GridRun,
  type Tool,
} from "./model";
import { MARKER_COLORS, hex } from "./tileArt";

type Slot = { world: number; level: number };

const LS_LAST = "banjo.levelEditor.last";
const workKey = (id: string) => `banjo.levelEditor.work.${id}`;
const MAX_HISTORY = 200;

// ------------------------------------------------------------ doc helpers
function docFromDef(def: LevelDef, note = ""): EditorDoc {
  return {
    grid: normalizeGrid(def.grid),
    enemies: { ...def.enemies },
    ...(def.hurryTicks !== undefined ? { hurryTicks: def.hurryTicks } : {}),
    ...(def.secondPour !== undefined ? { secondPour: def.secondPour } : {}),
    note,
  };
}

function docFromDraft(d: LevelDraft): EditorDoc {
  return docFromDef({ grid: d.grid, enemies: d.enemies, hurryTicks: d.hurryTicks, secondPour: d.secondPour }, d.note ?? "");
}

function defFromDoc(doc: EditorDoc): LevelDef {
  return {
    grid: doc.grid,
    enemies: { ...doc.enemies },
    ...(doc.hurryTicks !== undefined ? { hurryTicks: doc.hurryTicks } : {}),
    ...(doc.secondPour !== undefined ? { secondPour: doc.secondPour } : {}),
  };
}

function draftFromDoc(doc: EditorDoc, slot: Slot, authoredGrid: Grid): LevelDraft {
  return validateDraft({
    version: 1,
    world: slot.world,
    level: slot.level,
    grid: doc.grid,
    enemies: doc.enemies,
    hurryTicks: doc.hurryTicks,
    secondPour: doc.secondPour,
    note: doc.note || undefined,
    basedOn: gridHash(authoredGrid),
  });
}

/** Same level content (note excluded): nothing to save / nothing modified. */
function sameContent(a: EditorDoc, b: EditorDoc): boolean {
  return (
    a.grid.join("\n") === b.grid.join("\n") &&
    JSON.stringify(ENEMY_LETTERS.map((l) => a.enemies[l] ?? null)) === JSON.stringify(ENEMY_LETTERS.map((l) => b.enemies[l] ?? null)) &&
    a.hurryTicks === b.hurryTicks &&
    a.secondPour === b.secondPour
  );
}

function readWork(id: string): EditorDoc | null {
  try {
    const raw = localStorage.getItem(workKey(id));
    if (!raw) return null;
    const w = JSON.parse(raw) as { doc?: EditorDoc };
    if (!w.doc || !Array.isArray(w.doc.grid) || w.doc.grid.length !== GRID_H) return null;
    return { ...w.doc, grid: normalizeGrid(w.doc.grid), enemies: w.doc.enemies ?? {}, note: w.doc.note ?? "" };
  } catch {
    return null;
  }
}

function writeWork(id: string, doc: EditorDoc | null): void {
  try {
    if (doc) localStorage.setItem(workKey(id), JSON.stringify({ doc, at: Date.now() }));
    else localStorage.removeItem(workKey(id));
  } catch {
    // storage full or blocked: the draft endpoint is the real save
  }
}

function readLastSlot(): Slot {
  try {
    const raw = localStorage.getItem(LS_LAST);
    if (raw) {
      const s = JSON.parse(raw) as Slot;
      if (s.world >= 1 && s.world <= 9 && s.level >= 1 && s.level <= 11) return s;
    }
  } catch {
    // fall through
  }
  return { world: 1, level: 1 };
}

function authoredDocFor(slot: Slot): EditorDoc {
  return docFromDef(getAuthoredLevelDef(absoluteLevelIndex(slot.world, slot.level)));
}

// ------------------------------------------------------------ component
export function LevelEditor() {
  const [slot, setSlot] = useState<Slot>(readLastSlot);
  const slotId = draftId(slot.world, slot.level);
  const levelIndex = absoluteLevelIndex(slot.world, slot.level);
  const world = WORLDS[slot.world - 1];
  const authored = useMemo(() => authoredDocFor(slot), [slot]);

  const [doc, setDocState] = useState<EditorDoc>(() => readWork(draftId(readLastSlot().world, readLastSlot().level)) ?? authoredDocFor(readLastSlot()));
  const docRef = useRef(doc);
  docRef.current = doc;
  const undoRef = useRef<EditorDoc[]>([]);
  const redoRef = useRef<EditorDoc[]>([]);
  const [, bumpHistory] = useState(0);

  const [tool, setTool] = useState<Tool>(TOOLS[1]);
  const [selection, setSelection] = useState<GridRun | null>(null);
  const [overlays, setOverlays] = useState<Overlays>({ grid: true, tiers: true, diff: true, lint: true, arc: true });
  const [skinWorld, setSkinWorld] = useState<number | null>(null);
  const [hover, setHover] = useState<HoverInfo>(null);
  const [rawOpen, setRawOpen] = useState(false);
  const [rawText, setRawText] = useState("");
  const [rawError, setRawError] = useState<string | null>(null);
  const [exportTab, setExportTab] = useState<"ts" | "json" | "diff">("ts");
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [playCast, setPlayCast] = useState("earl");
  const [draftsOn, setDraftsOn] = useState(draftsEnabledInGame());

  // dev server: null = asking, false = none (static build), else the listing
  const [server, setServer] = useState<DraftListing | false | null>(null);
  const serverDrafts = useMemo(() => {
    const m = new Map<string, LevelDraft>();
    if (server) for (const d of server.drafts) m.set(draftId(d.world, d.level), d);
    return m;
  }, [server]);
  const diskDraft = serverDrafts.get(slotId) ?? null;

  const say = useCallback((text: string, bad = false) => {
    setToast({ text, bad });
    window.setTimeout(() => setToast((t) => (t && t.text === text ? null : t)), bad ? 6000 : 2500);
  }, []);

  const refreshServer = useCallback(async () => {
    const listing = await fetchDraftListing();
    setServer(listing ?? false);
    return listing;
  }, []);

  // mount: ask the dev server for drafts; if this slot has no local work and
  // a draft is on disk, start from the draft
  useEffect(() => {
    void refreshServer().then((listing) => {
      if (!listing) return;
      const id = draftId(slot.world, slot.level);
      const onDisk = listing.drafts.find((d) => draftId(d.world, d.level) === id);
      if (onDisk && !readWork(id)) {
        setDocState(docFromDraft(onDisk));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // autosave the working copy; drop it when it matches the authored level
  useEffect(() => {
    writeWork(slotId, sameContent(doc, authored) && !doc.note ? null : doc);
  }, [doc, slotId, authored]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_LAST, JSON.stringify(slot));
    } catch {
      // fine
    }
  }, [slot]);

  // ------------------------------------------------------------ history
  const snapshot = useCallback(() => {
    undoRef.current.push(docRef.current);
    if (undoRef.current.length > MAX_HISTORY) undoRef.current.shift();
    redoRef.current = [];
    bumpHistory((n) => n + 1);
  }, []);
  const setDoc = useCallback((next: EditorDoc) => {
    docRef.current = next;
    setDocState(next);
  }, []);
  /** a discrete edit: snapshot then apply */
  const commit = useCallback(
    (patch: Partial<EditorDoc> | ((d: EditorDoc) => EditorDoc)) => {
      snapshot();
      const cur = docRef.current;
      setDoc(typeof patch === "function" ? patch(cur) : { ...cur, ...patch });
    },
    [snapshot, setDoc],
  );
  const undo = useCallback(() => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    redoRef.current.push(docRef.current);
    setDoc(prev);
    setSelection(null);
    bumpHistory((n) => n + 1);
  }, [setDoc]);
  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(docRef.current);
    setDoc(next);
    setSelection(null);
    bumpHistory((n) => n + 1);
  }, [setDoc]);

  // ------------------------------------------------------------ slot changes
  const loadSlot = useCallback(
    (next: Slot, source: "auto" | "authored" | "draft") => {
      const id = draftId(next.world, next.level);
      const authoredDoc = authoredDocFor(next);
      let d: EditorDoc;
      if (source === "authored") d = authoredDoc;
      else if (source === "draft") d = serverDrafts.get(id) ? docFromDraft(serverDrafts.get(id)!) : authoredDoc;
      else d = readWork(id) ?? (serverDrafts.get(id) ? docFromDraft(serverDrafts.get(id)!) : authoredDoc);
      undoRef.current = [];
      redoRef.current = [];
      setSelection(null);
      setSlot(next);
      setDoc(d);
      setRawOpen(false);
      bumpHistory((n) => n + 1);
    },
    [serverDrafts, setDoc],
  );

  // ------------------------------------------------------------ keyboard
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod) return;
      if (selection) {
        const cur = docRef.current;
        const nudge = (dx: number, dy: number) => {
          e.preventDefault();
          const r = relocateRun(cur.grid, selection, selection.row + dy, selection.c0 + dx, selection.c1 + dx);
          if (r.grid !== cur.grid) {
            commit({ grid: r.grid });
            setSelection(r.run);
          }
        };
        if (e.key === "ArrowLeft") return nudge(-1, 0);
        if (e.key === "ArrowRight") return nudge(1, 0);
        if (e.key === "ArrowUp") return nudge(0, -1);
        if (e.key === "ArrowDown") return nudge(0, 1);
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          commit({ grid: deleteRun(cur.grid, selection) });
          setSelection(null);
          return;
        }
        if (e.key === "Escape") {
          setSelection(null);
          return;
        }
      }
      const tl = toolByHotkey(e.key) ?? toolByHotkey(e.key.toLowerCase());
      if (tl) {
        setTool(tl);
        if (tl.kind !== "select") setSelection(null);
      } else if (e.key === "g") setOverlays((o) => ({ ...o, grid: !o.grid }));
      else if (e.key === "t") setOverlays((o) => ({ ...o, tiers: !o.tiers }));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selection, undo, redo, commit]);

  // ------------------------------------------------------------ derived
  const effectiveEnemies = useMemo(
    () => ({ ...world.defaultEnemies, ...doc.enemies }) as Partial<Record<EnemyLetter, EnemyKind>>,
    [world, doc.enemies],
  );
  const lint = useMemo(() => lintLevel(defFromDoc(doc), slot.world, slot.level), [doc, slot]);
  const lintCells = useMemo(() => {
    const out: { x: number; y: number; severity: LintItem["severity"] }[] = [];
    for (const it of lint.items) if (it.cells && it.severity !== "info") for (const c of it.cells) out.push({ ...c, severity: it.severity });
    return out;
  }, [lint]);
  const modified = !sameContent(doc, authored);
  const matchesDisk = diskDraft ? sameContent(doc, docFromDraft(diskDraft)) && (doc.note || "") === (diskDraft.note ?? "") : false;
  const letterCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of doc.grid) for (const ch of row) if ("abcdJ".includes(ch)) counts[ch] = (counts[ch] ?? 0) + 1;
    return counts;
  }, [doc.grid]);
  const caged = rescueForLevel(levelIndex);
  const skin = WORLDS[(skinWorld ?? slot.world) - 1];

  const exportText = useMemo(() => {
    const def = defFromDoc(doc);
    if (exportTab === "ts") {
      const head = `  // ${slot.world}-${slot.level}${doc.note ? `: ${doc.note}` : ""}`;
      return `${head}\n${levelDefToTs(def)}`;
    }
    if (exportTab === "json") {
      try {
        return JSON.stringify(draftFromDoc(doc, slot, authored.grid), null, 2);
      } catch (err) {
        return `// not exportable yet: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    const lines = diffSummary(authored.grid, doc.grid);
    for (const l of ENEMY_LETTERS) {
      if ((authored.enemies[l] ?? null) !== (doc.enemies[l] ?? null)) {
        lines.push(`enemies.${l}: ${authored.enemies[l] ?? "(world default)"} -> ${doc.enemies[l] ?? "(world default)"}`);
      }
    }
    if (authored.hurryTicks !== doc.hurryTicks) lines.push(`hurryTicks: ${authored.hurryTicks ?? "default"} -> ${doc.hurryTicks ?? "default"}`);
    if (authored.secondPour !== doc.secondPour) lines.push(`secondPour: ${authored.secondPour ?? "default"} -> ${doc.secondPour ?? "default"}`);
    return lines.length ? `${slot.world}-${slot.level} vs authored:\n${lines.join("\n")}` : `${slot.world}-${slot.level}: identical to authored`;
  }, [doc, exportTab, slot, authored]);

  // ------------------------------------------------------------ actions
  const copyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      say("copied");
    } catch {
      say("clipboard blocked; select the text and copy", true);
    }
  };

  const saveDraft = async () => {
    if (!server) return;
    setBusy(true);
    try {
      const saved = await saveDraftToServer(draftFromDoc(doc, slot, authored.grid));
      await refreshServer();
      say(`saved ${draftId(saved.world, saved.level)}.json`);
    } catch (err) {
      say(err instanceof Error ? err.message : String(err), true);
    } finally {
      setBusy(false);
    }
  };

  const removeDraft = async () => {
    if (!server || !diskDraft) return;
    if (!window.confirm(`Delete ${slotId}.json from disk? Your working copy stays in the editor.`)) return;
    setBusy(true);
    try {
      await deleteDraftOnServer(slot.world, slot.level);
      await refreshServer();
      say("draft deleted");
    } catch (err) {
      say(err instanceof Error ? err.message : String(err), true);
    } finally {
      setBusy(false);
    }
  };

  const promote = async () => {
    if (!server || !server.promoteEnabled || !diskDraft) return;
    if (!window.confirm(`Promote ${slotId}.json into src/game/levels/w${slot.world}.ts? This rewrites the authored level.`)) return;
    setBusy(true);
    try {
      const r = await promoteDraftOnServer(slot.world, slot.level);
      await refreshServer();
      say(`promoted into ${r.file} (${r.changedRows} rows changed); run the audit`);
    } catch (err) {
      say(err instanceof Error ? err.message : String(err), true);
    } finally {
      setBusy(false);
    }
  };

  const play = () => {
    let draft: LevelDraft;
    try {
      draft = draftFromDoc(doc, slot, authored.grid);
    } catch (err) {
      say(err instanceof Error ? err.message : String(err), true);
      return;
    }
    // register here too so this tab's registry matches what the game tab sees
    registerDraft(draft);
    const payload = { ...draft, note: undefined };
    const q = new URLSearchParams({ quickstart: "", level: String(levelIndex), cast: playCast, draft: JSON.stringify(payload) });
    window.open(`${window.location.pathname}?${q.toString()}#/`, "_blank");
  };

  const revertToAuthored = () => {
    if (modified && !window.confirm("Throw away the working copy and reload the authored level?")) return;
    unregisterDraft(slot.world, slot.level);
    loadSlot(slot, "authored");
  };

  const applyRaw = () => {
    const rows = rawText.replace(/\r/g, "").split("\n").filter((r, i, arr) => !(i === arr.length - 1 && r === ""));
    if (rows.length !== GRID_H) {
      setRawError(`need ${GRID_H} rows, got ${rows.length}`);
      return;
    }
    const grid = normalizeGrid(rows);
    for (let i = 0; i < GRID_H; i++) {
      for (const ch of grid[i]) {
        if (!"#=^.12abcd~<>JSWR".includes(ch)) {
          setRawError(`row ${i}: unknown symbol '${ch}'`);
          return;
        }
      }
    }
    setRawError(null);
    commit({ grid });
    say("grid applied");
  };

  const toggleDraftsInGame = () => {
    const next = !draftsOn;
    setDraftsEnabledInGame(next);
    setDraftsOn(next);
  };

  // ------------------------------------------------------------ render
  const chip = (on: boolean) =>
    `rounded border px-2 py-1 text-xs ${on ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`;
  const btn = "rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40";
  const primary = "rounded border border-emerald-700 bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="flex h-screen flex-col text-sm">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <h1 className="text-base font-bold">Level editor</h1>
        <span className="text-xs text-slate-500">
          {world.name} · {slot.world}-{slot.level} (level {levelIndex}){world.bossId && slot.level === 11 ? " · boss bowl" : ""}
        </span>
        <span className={`rounded px-2 py-0.5 text-[11px] ${modified ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"}`}>
          {modified ? "modified vs authored" : "matches authored"}
        </span>
        {diskDraft && (
          <span className={`rounded px-2 py-0.5 text-[11px] ${matchesDisk ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800"}`}>
            draft on disk{matchesDisk ? "" : " (differs from editor)"}
          </span>
        )}
        <span className="ml-auto text-[11px] text-slate-500">
          {server === null ? "checking dev server..." : server ? `dev server: ${server.drafts.length} draft(s) on disk` : "no dev server: drafts save to this browser only"}
        </span>
        {toast && (
          <span className={`rounded px-2 py-0.5 text-[11px] ${toast.bad ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"}`}>{toast.text}</span>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ---------------------------------------------------- picker */}
        <aside className="flex w-56 shrink-0 flex-col gap-3 overflow-y-auto border-r border-slate-200 bg-white p-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold">World</span>
            <select
              className="rounded border border-slate-300 px-1 py-1"
              value={slot.world}
              onChange={(e) => loadSlot({ world: Number(e.target.value), level: 1 }, "auto")}
            >
              {WORLDS.map((w) => (
                <option key={w.index} value={w.index}>
                  {w.index}. {w.name}
                </option>
              ))}
            </select>
          </label>
          <div className="text-xs">
            <div className="mb-1 font-semibold">Level</div>
            <div className="grid grid-cols-4 gap-1">
              {Array.from({ length: 11 }, (_, i) => i + 1).map((lv) => {
                const id = draftId(slot.world, lv);
                const hasDisk = serverDrafts.has(id);
                const hasWork = !!readWork(id);
                const active = lv === slot.level;
                return (
                  <button
                    key={lv}
                    className={`relative rounded border px-1 py-1 ${active ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 hover:bg-slate-100"}`}
                    onClick={() => loadSlot({ world: slot.world, level: lv }, "auto")}
                    title={`${hasDisk ? "draft on disk. " : ""}${hasWork ? "working copy in this browser." : ""}`}
                  >
                    {lv}
                    {lv === 11 ? "b" : lv === 5 ? "w" : ""}
                    {(hasDisk || hasWork) && (
                      <span className={`absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full ${hasDisk ? "bg-sky-500" : "bg-amber-400"}`} />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mt-1 text-[10px] text-slate-500">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-500" /> draft on disk · <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" /> working copy
            </div>
          </div>

          <div className="flex flex-col gap-1 text-xs">
            <div className="font-semibold">Source</div>
            <button className={btn} onClick={revertToAuthored}>
              Reload authored level
            </button>
            <button className={btn} disabled={!diskDraft} onClick={() => loadSlot(slot, "draft")}>
              Reload draft from disk
            </button>
          </div>

          <div className="flex flex-col gap-1 text-xs">
            <div className="font-semibold">Drafts</div>
            <button className={primary} disabled={!server || busy} onClick={saveDraft} title="writes src/game/levels/drafts/<id>.json">
              Save draft to disk
            </button>
            <button className={btn} disabled={!server || busy || !diskDraft} onClick={removeDraft}>
              Delete draft from disk
            </button>
            {server && server.promoteEnabled && (
              <button className={`${btn} border-red-300 text-red-700`} disabled={busy || !diskDraft} onClick={promote} title="rewrites the authored w{N}.ts">
                Promote draft into w{slot.world}.ts
              </button>
            )}
            <label className="mt-1 flex items-center gap-2">
              <input type="checkbox" checked={draftsOn} onChange={toggleDraftsInGame} />
              <span>game uses drafts (this browser)</span>
            </label>
            {server && server.problems.length > 0 && (
              <div className="rounded bg-red-50 p-1 text-[10px] text-red-700">
                {server.problems.map((p) => (
                  <div key={p}>{p}</div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1 text-xs">
            <div className="font-semibold">Play</div>
            <select className="rounded border border-slate-300 px-1 py-1" value={playCast} onChange={(e) => setPlayCast(e.target.value)}>
              {CAST.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName} (jump {c.jump})
                </option>
              ))}
            </select>
            <button className={primary} onClick={play} title="opens the game in a new tab with this grid in the URL">
              Play this level
            </button>
            <div className="text-[10px] text-slate-500">quickstart keys: 0 clears the level, 9 frenzy, 8 shrine</div>
          </div>

          <div className="mt-auto text-[10px] text-slate-400">
            <div>ctrl+z / ctrl+y undo redo · g grid · t tiers</div>
            <div>right-drag erases with any tool</div>
          </div>
        </aside>

        {/* ---------------------------------------------------- canvas */}
        <main className="flex min-w-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
          <div className="flex flex-wrap items-center gap-1">
            {TOOLS.map((t) => {
              const color = MARKER_COLORS[t.ch];
              return (
                <button
                  key={t.id}
                  className={chip(tool.id === t.id)}
                  onClick={() => {
                    setTool(t);
                    if (t.kind !== "select") setSelection(null);
                  }}
                  title={`${t.hint} [${t.hotkey}]`}
                >
                  {color && <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: color }} />}
                  {t.label}
                  <span className="ml-1 opacity-50">{t.hotkey}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            {(
              [
                ["grid", "grid"],
                ["tiers", "tier guides"],
                ["diff", "diff vs authored"],
                ["lint", "lint marks"],
                ["arc", "jump envelope"],
              ] as [keyof Overlays, string][]
            ).map(([k, label]) => (
              <label key={k} className="flex items-center gap-1">
                <input type="checkbox" checked={overlays[k]} onChange={() => setOverlays((o) => ({ ...o, [k]: !o[k] }))} />
                {label}
              </label>
            ))}
            <label className="ml-auto flex items-center gap-1">
              skin
              <select className="rounded border border-slate-300 px-1" value={skinWorld ?? 0} onChange={(e) => setSkinWorld(Number(e.target.value) || null)}>
                <option value={0}>this world ({world.name})</option>
                {WORLDS.map((w) => (
                  <option key={w.index} value={w.index}>
                    {w.index}. {w.name}
                  </option>
                ))}
              </select>
            </label>
            <button className={btn} onClick={undo} disabled={undoRef.current.length === 0}>
              undo
            </button>
            <button className={btn} onClick={redo} disabled={redoRef.current.length === 0}>
              redo
            </button>
          </div>

          <div className="mx-auto w-full" style={{ maxWidth: 1152 }}>
            <GridCanvas
              grid={doc.grid}
              authored={authored.grid}
              skin={skin}
              tool={tool}
              selection={selection}
              overlays={overlays}
              enemies={effectiveEnemies}
              lintCells={lintCells}
              onSelect={setSelection}
              onStrokeStart={snapshot}
              onGridChange={(grid) => setDoc({ ...docRef.current, grid })}
              onHover={setHover}
            />
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
            <span className="font-mono">
              {hover ? `col ${hover.x}, row ${hover.y} · '${hover.ch}'${"abcd".includes(hover.ch) ? ` ${effectiveEnemies[hover.ch as EnemyLetter] ?? "(undeclared)"}` : ""}` : "hover a cell"}
            </span>
            {selection && (
              <span className="font-mono">
                selected '{selection.ch}' run: row {selection.row}, cols {selection.c0}-{selection.c1} ({selection.c1 - selection.c0 + 1} wide) · arrows nudge · Delete removes
              </span>
            )}
            <span className="italic text-slate-500">{tool.hint}</span>
            <button
              className={`${btn} ml-auto`}
              onClick={() => {
                setRawText(doc.grid.join("\n"));
                setRawError(null);
                setRawOpen((o) => !o);
              }}
            >
              {rawOpen ? "hide" : "edit as text"}
            </button>
          </div>

          {rawOpen && (
            <div className="flex flex-col gap-1">
              <textarea
                className="h-72 w-full rounded border border-slate-300 bg-slate-900 p-2 font-mono text-xs leading-4 text-slate-100"
                spellCheck={false}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                style={{ letterSpacing: "0.15em" }}
              />
              <div className="flex items-center gap-2 text-xs">
                <button className={primary} onClick={applyRaw}>
                  Apply text to grid
                </button>
                <button className={btn} onClick={() => setRawText(doc.grid.join("\n"))}>
                  Reset from grid
                </button>
                {rawError && <span className="text-red-700">{rawError}</span>}
                <span className="text-slate-500">
                  {GRID_W} chars per row, {GRID_H} rows, symbols # = ^ . 1 2 a-d ~ &lt; &gt; J S W R
                </span>
              </div>
            </div>
          )}
        </main>

        {/* ---------------------------------------------------- inspector */}
        <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-slate-200 bg-white p-3 text-xs">
          <section>
            <div className="mb-1 font-semibold">Enemy legend</div>
            <div className="mb-1 text-[10px] text-slate-500">
              world defaults: {ENEMY_LETTERS.filter((l) => world.defaultEnemies[l]).map((l) => `${l}=${world.defaultEnemies[l]}`).join(", ") || "none"}
            </div>
            {ENEMY_LETTERS.map((l) => (
              <label key={l} className="mb-1 flex items-center gap-2">
                <span className="w-4 font-mono font-bold" style={{ color: MARKER_COLORS[l] }}>
                  {l}
                </span>
                <select
                  className="flex-1 rounded border border-slate-300 px-1 py-0.5"
                  value={doc.enemies[l] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    commit((d) => {
                      const enemies = { ...d.enemies };
                      if (v) enemies[l] = v as EnemyKind;
                      else delete enemies[l];
                      return { ...d, enemies };
                    });
                  }}
                >
                  <option value="">{world.defaultEnemies[l] ? `world default (${world.defaultEnemies[l]})` : "not declared"}</option>
                  {ENEMY_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <span className="w-10 text-right text-slate-500">x{letterCounts[l] ?? 0}</span>
              </label>
            ))}
            <div className="text-[10px] text-slate-500">
              jars J x{letterCounts.J ?? 0}
              {caged ? ` · caged here: ${caged.displayName} (needs an R)` : ""}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <div className="font-semibold">Overrides</div>
            <label className="flex items-center gap-2">
              <span className="w-24">hurry-up</span>
              <input
                type="number"
                min={5}
                max={600}
                className="w-20 rounded border border-slate-300 px-1 py-0.5"
                placeholder={String(HURRY_UP_TICKS / TICK_HZ)}
                value={doc.hurryTicks !== undefined ? Math.round(doc.hurryTicks / TICK_HZ) : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  commit((d) => {
                    const n = { ...d };
                    if (v === "") delete n.hurryTicks;
                    else n.hurryTicks = Math.max(1, Math.round(Number(v))) * TICK_HZ;
                    return n;
                  });
                }}
              />
              <span className="text-slate-500">seconds (blank = default {HURRY_UP_TICKS / TICK_HZ}s)</span>
            </label>
            <label className="flex items-center gap-2">
              <span className="w-24">second pour</span>
              <select
                className="rounded border border-slate-300 px-1 py-0.5"
                value={doc.secondPour === undefined ? "" : doc.secondPour ? "on" : "off"}
                onChange={(e) => {
                  const v = e.target.value;
                  commit((d) => {
                    const n = { ...d };
                    if (v === "") delete n.secondPour;
                    else n.secondPour = v === "on";
                    return n;
                  });
                }}
              >
                <option value="">default ({[3, 7, 10].includes(slot.level) ? "on" : "off"} for level {slot.level})</option>
                <option value="on">force on</option>
                <option value="off">force off</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span>note (travels with the draft)</span>
              <textarea
                className="h-16 rounded border border-slate-300 p-1"
                value={doc.note}
                placeholder="what you tried, how it felt, what to look at"
                onChange={(e) => setDoc({ ...docRef.current, note: e.target.value })}
              />
            </label>
          </section>

          <section>
            <div className="mb-1 flex items-center gap-2 font-semibold">
              Lint
              <span className="text-[10px] font-normal text-slate-500">
                {lint.audit ? `${lint.audit.reached.size}/${lint.audit.totalRuns} surfaces reachable` : ""}
              </span>
            </div>
            {lint.items.length === 0 ? (
              <div className="rounded bg-emerald-50 p-2 text-emerald-800">clean: every surface reachable, all markers grounded</div>
            ) : (
              <ul className="flex flex-col gap-1">
                {lint.items.map((it, i) => (
                  <li
                    key={i}
                    className={`rounded p-1.5 ${it.severity === "error" ? "bg-red-50 text-red-800" : it.severity === "warn" ? "bg-amber-50 text-amber-800" : "bg-sky-50 text-sky-800"}`}
                  >
                    {it.message}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex min-h-0 flex-col">
            <div className="mb-1 flex items-center gap-1">
              <span className="mr-1 font-semibold">Export</span>
              {(["ts", "json", "diff"] as const).map((t) => (
                <button key={t} className={chip(exportTab === t)} onClick={() => setExportTab(t)}>
                  {t === "ts" ? "TS snippet" : t === "json" ? "draft JSON" : "diff"}
                </button>
              ))}
              <button className={`${btn} ml-auto`} onClick={copyExport}>
                copy
              </button>
            </div>
            <textarea
              readOnly
              className="h-64 w-full rounded border border-slate-300 bg-slate-900 p-2 font-mono text-[10px] leading-3 text-slate-100"
              value={exportText}
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="mt-1 text-[10px] text-slate-500">
              {exportTab === "ts"
                ? `paste-ready for src/game/levels/w${slot.world}.ts (replaces the ${slot.level}${slot.level === 1 ? "st" : slot.level === 2 ? "nd" : slot.level === 3 ? "rd" : "th"} entry)`
                : exportTab === "json"
                  ? `the same file "Save draft" writes to src/game/levels/drafts/${slotId}.json`
                  : "what changed, for the hand-off note"}
            </div>
          </section>

          <section className="text-[10px] text-slate-400">
            <div>
              palette: <span style={{ color: hex(world.palette.platform) }}>platform</span> · <span style={{ color: hex(world.palette.solid) }}>solid</span> · <span style={{ color: hex(world.palette.glow) }}>glow</span>
            </div>
            <div>promote from the CLI: npm run levels:promote {slotId}</div>
          </section>
        </aside>
      </div>
    </div>
  );
}
