// SFX mixer (/admin/sfx): audition every sound effect back to back and set
// its loudness trim. Trims apply live to the shared engine (so the game tab
// in this same window hears them), and Save writes src/game/audio/sfx-trim.json
// through the Vite dev plugin so the balance ships.
//
// "Measure" renders each sound offline and shows its loudest-100ms RMS and
// peak (dBFS); "Suggest" computes the trim that would put every sound on
// one target level, as a starting point for ears to finish. Nothing is
// applied until you click Apply.
//
// Keys: ↑/↓ select, Space play, R play the reference, [ / ] nudge ±0.5 dB,
// 0 reset the row to saved.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audio, SFX_TRIM } from "../../game/audio/engine";
import { SFX_CATALOG, SFX_GROUPS, type SfxDef, type SfxGroup } from "../../game/audio/sfxCatalog";
import { dB, fromDb, measureSfx, suggestTrim, type SfxMeasure } from "../../game/audio/sfxMeter";
import { fetchSavedTrims, saveTrimsToServer } from "../../game/audio/trimClient";

type Trims = Record<string, number>;

const MIN_DB = -24;
const MAX_DB = 12;
const clampDb = (v: number) => Math.min(MAX_DB, Math.max(MIN_DB, v));
const trimToDb = (g: number) => (g > 0 ? Math.max(MIN_DB, dB(g)) : MIN_DB);
const dbToTrim = (db: number) => fromDb(clampDb(db));
const fmtDb = (v: number, plus = true) =>
  !Number.isFinite(v) ? "—" : `${plus && v > 0 ? "+" : ""}${v.toFixed(1)}`;

function fullTable(base: Trims): Trims {
  const out: Trims = {};
  for (const d of SFX_CATALOG) out[d.name] = base[d.name] ?? 1;
  return out;
}

function play(name: string, pitch: number): void {
  audio.ensure();
  audio.playSfx(name, pitch);
}

function Meter({ m }: { m: SfxMeasure | undefined }) {
  if (!m) return <div className="h-3 w-44 rounded bg-slate-100" title="not measured" />;
  // bar from -48 dBFS to 0
  const pct = (v: number) => Math.max(0, Math.min(100, ((v + 48) / 48) * 100));
  return (
    <div
      className="relative h-3 w-44 overflow-hidden rounded bg-slate-100"
      title={`loudest 100ms ${fmtDb(m.loud, false)} dBFS · body ${fmtDb(m.body, false)} · peak ${fmtDb(m.peak, false)} · ${m.seconds.toFixed(2)}s`}
    >
      <div className="absolute inset-y-0 left-0 bg-emerald-400" style={{ width: `${pct(m.loud)}%` }} />
      <div className="absolute inset-y-0 w-0.5 bg-slate-700" style={{ left: `${pct(m.peak)}%` }} />
    </div>
  );
}

export function SfxMixer() {
  const [saved, setSaved] = useState<Trims>(() => fullTable(SFX_TRIM));
  const [trims, setTrims] = useState<Trims>(() => fullTable(SFX_TRIM));
  const [measures, setMeasures] = useState<Record<string, SfxMeasure>>({});
  const [selected, setSelected] = useState<string>(SFX_CATALOG[0].name);
  const [reference, setReference] = useState<string>("pop");
  const [targetDb, setTargetDb] = useState(-18);
  const [targetTouched, setTargetTouched] = useState(false);
  const [server, setServer] = useState<"probing" | "on" | "off">("probing");
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [filter, setFilter] = useState("");
  const rows = useRef(new Map<string, HTMLTableRowElement>());
  const stopRef = useRef(false);

  // dev server? also re-sync `saved` from disk (the import can lag after HMR)
  useEffect(() => {
    void fetchSavedTrims().then((t) => {
      if (!t) {
        setServer("off");
        return;
      }
      setServer("on");
      const full = fullTable(t);
      setSaved(full);
      setTrims(full);
      audio.setTrims(full);
    });
  }, []);

  // every trim edit goes live in the shared engine
  const update = useCallback((name: string, gain: number) => {
    setTrims((t) => ({ ...t, [name]: gain }));
    audio.setTrim(name, gain);
  }, []);

  const dirty = useMemo(
    () => SFX_CATALOG.filter((d) => Math.abs(trims[d.name] - saved[d.name]) > 1e-4).map((d) => d.name),
    [trims, saved],
  );

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return SFX_CATALOG;
    return SFX_CATALOG.filter((d) => d.name.toLowerCase().includes(q) || d.note.toLowerCase().includes(q));
  }, [filter]);

  const defaultPitch = (d: SfxDef) => d.pitch ?? d.pitches?.[0] ?? 1;

  const playDef = useCallback((d: SfxDef, pitch?: number) => play(d.name, pitch ?? defaultPitch(d)), []);

  const nudge = useCallback(
    (names: string[], deltaDb: number) => {
      const next = { ...trims };
      for (const n of names) next[n] = dbToTrim(trimToDb(trims[n]) + deltaDb);
      setTrims(next);
      audio.setTrims(next);
    },
    [trims],
  );

  const revert = useCallback(
    (names: string[]) => {
      const next = { ...trims };
      for (const n of names) next[n] = saved[n];
      setTrims(next);
      audio.setTrims(next);
    },
    [trims, saved],
  );

  const playAll = useCallback(async () => {
    setBusy("playing");
    stopRef.current = false;
    audio.ensure();
    for (const d of visible) {
      if (stopRef.current) break;
      setSelected(d.name);
      rows.current.get(d.name)?.scrollIntoView({ block: "nearest" });
      playDef(d);
      const m = measures[d.name];
      const wait = Math.min(2.5, Math.max(0.45, (m?.seconds ?? 0.5) + 0.25));
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
    setBusy(null);
  }, [visible, playDef, measures]);

  const measureAll = useCallback(async () => {
    setBusy("measuring");
    stopRef.current = false;
    const out: Record<string, SfxMeasure> = { ...measures };
    let i = 0;
    for (const d of visible) {
      if (stopRef.current) break;
      i++;
      setStatus(`measuring ${i}/${visible.length}: ${d.name}`);
      try {
        out[d.name] = await measureSfx(d.name, defaultPitch(d), trims);
      } catch (err) {
        setStatus(`measure failed for ${d.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
      setMeasures({ ...out });
    }
    // until the target is typed, aim at the measured median: the most honest
    // "bring the outliers in" default (a fixed number pins everything at the
    // slider's end on a table that sits 12 dB below it)
    if (!targetTouched) {
      const louds = Object.values(out)
        .map((m) => m.loud)
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
      if (louds.length) setTargetDb(Math.round(louds[Math.floor(louds.length / 2)]));
    }
    setStatus(`measured ${i} sound(s) at their current trims`);
    setBusy(null);
  }, [visible, trims, measures, targetTouched]);

  const suggestions = useMemo(() => {
    const out: Record<string, number> = {};
    for (const d of SFX_CATALOG) {
      const m = measures[d.name];
      if (!m) continue;
      // the measurement baked in the trim at measure time; re-derive from the
      // measured level which is absolute, using the trim that was live then
      const s = suggestTrim(m, trims[d.name], targetDb);
      if (s !== null) out[d.name] = dbToTrim(trimToDb(s));
    }
    return out;
  }, [measures, trims, targetDb]);

  const applySuggestions = useCallback(
    (names: string[]) => {
      const next = { ...trims };
      for (const n of names) if (suggestions[n] !== undefined) next[n] = suggestions[n];
      setTrims(next);
      audio.setTrims(next);
      // the suggestion was relative to the old trim: measurements are now stale
      setMeasures((ms) => {
        const copy = { ...ms };
        for (const n of names) delete copy[n];
        return copy;
      });
    },
    [trims, suggestions],
  );

  const save = useCallback(async () => {
    setBusy("saving");
    try {
      const file = await saveTrimsToServer(trims);
      setSaved({ ...trims });
      setStatus(`saved ${file}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
    setBusy(null);
  }, [trims]);

  const copyJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(trims, null, 2) + "\n");
      setStatus("copied sfx-trim.json to the clipboard");
    } catch {
      setStatus("clipboard unavailable");
    }
  }, [trims]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const idx = visible.findIndex((d) => d.name === selected);
      const cur = visible[idx];
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const n = visible[Math.max(0, Math.min(visible.length - 1, idx + (e.key === "ArrowDown" ? 1 : -1)))];
        if (n) {
          setSelected(n.name);
          rows.current.get(n.name)?.scrollIntoView({ block: "nearest" });
        }
      } else if (e.key === " ") {
        e.preventDefault();
        if (cur) playDef(cur);
      } else if (e.key === "r" || e.key === "R") {
        const ref = SFX_CATALOG.find((d) => d.name === reference);
        if (ref) playDef(ref);
      } else if (e.key === "[" || e.key === "]") {
        if (cur) nudge([cur.name], e.key === "]" ? 0.5 : -0.5);
      } else if (e.key === "0") {
        if (cur) revert([cur.name]);
      } else if (e.key === "Escape") {
        stopRef.current = true;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, selected, reference, playDef, nudge, revert]);

  const groups = SFX_GROUPS.map((g) => ({ ...g, defs: visible.filter((d) => d.group === g.id) })).filter(
    (g) => g.defs.length,
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-6 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-bold">SFX mixer</h1>
          <span className="text-xs text-slate-500">
            per-sound loudness trims · live in this tab · Save writes <code>src/game/audio/sfx-trim.json</code>
          </span>
          <span
            className={`ml-auto rounded px-2 py-0.5 text-xs ${
              server === "on" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
            }`}
          >
            {server === "probing" ? "probing dev server…" : server === "on" ? "dev server: save enabled" : "no dev server: copy JSON instead"}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <button className="btn" disabled={!!busy} onClick={() => void playAll()}>
            ▶ Play all
          </button>
          <button className="btn" disabled={!!busy} onClick={() => void measureAll()}>
            Measure all
          </button>
          {busy && (
            <button className="btn" onClick={() => (stopRef.current = true)}>
              ■ Stop
            </button>
          )}
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <label className="flex items-center gap-1 text-xs">
            target
            <input
              type="number"
              className="w-16 rounded border border-slate-300 px-1 py-0.5 text-right"
              value={targetDb}
              step={1}
              onChange={(e) => {
                setTargetTouched(true);
                setTargetDb(Number(e.target.value));
              }}
            />
            dBFS (loudest 100 ms; defaults to the measured median)
          </label>
          <button
            className="btn"
            disabled={!!busy || !Object.keys(suggestions).length}
            onClick={() => applySuggestions(Object.keys(suggestions))}
            title="set every measured sound's trim so its loudest 100 ms lands on the target"
          >
            Apply suggestions to all measured
          </button>
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <input
            className="w-44 rounded border border-slate-300 px-2 py-0.5"
            placeholder="filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <button className="btn" disabled={!dirty.length || !!busy} onClick={() => revert(dirty)}>
            Revert {dirty.length ? `(${dirty.length})` : ""}
          </button>
          {server === "on" ? (
            <button
              className="btn btn-primary"
              disabled={!dirty.length || !!busy}
              onClick={() => void save()}
            >
              Save {dirty.length ? `(${dirty.length})` : ""}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => void copyJson()}>
              Copy JSON
            </button>
          )}
          <span className="text-xs text-slate-500">{status}</span>
        </div>
        <div className="mt-1 text-[11px] text-slate-400">
          keys: ↑/↓ select · Space play · R play reference · [ ] ±0.5 dB · 0 reset row · Esc stop. Your SFX volume
          setting ({Math.round(audio.sfxVolume * 100)}%) applies on top of every trim, as in the game. Suggestions
          are a first pass (short-window RMS, not LUFS): trust your ears over the bars.
        </div>
      </header>

      <main className="px-6 py-4">
        {groups.map((g) => (
          <section key={g.id} className="mb-6">
            <div className="mb-1 flex items-center gap-3">
              <h2 className="text-sm font-bold">{g.title}</h2>
              <span className="text-xs text-slate-500">{g.blurb}</span>
              <span className="ml-auto flex items-center gap-1 text-xs">
                group
                <button className="btn-xs" onClick={() => nudge(g.defs.map((d) => d.name), -1)}>
                  −1 dB
                </button>
                <button className="btn-xs" onClick={() => nudge(g.defs.map((d) => d.name), 1)}>
                  +1 dB
                </button>
                <button
                  className="btn-xs"
                  disabled={!g.defs.some((d) => suggestions[d.name] !== undefined)}
                  onClick={() => applySuggestions(g.defs.map((d) => d.name))}
                >
                  apply suggestions
                </button>
              </span>
            </div>
            <table className="w-full border-collapse text-sm">
              <tbody>
                {g.defs.map((d) => {
                  const t = trims[d.name];
                  const db = trimToDb(t);
                  const isDirty = Math.abs(t - saved[d.name]) > 1e-4;
                  const m = measures[d.name];
                  const sug = suggestions[d.name];
                  const sugDb = sug !== undefined ? trimToDb(sug) : undefined;
                  return (
                    <tr
                      key={d.name}
                      ref={(el) => {
                        if (el) rows.current.set(d.name, el);
                        else rows.current.delete(d.name);
                      }}
                      onClick={() => setSelected(d.name)}
                      className={`border-t border-slate-100 ${
                        selected === d.name ? "bg-amber-50" : "hover:bg-slate-100/60"
                      }`}
                    >
                      <td className="w-8 py-1">
                        <button
                          className="btn-xs"
                          title="play"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(d.name);
                            playDef(d);
                          }}
                        >
                          ▶
                        </button>
                      </td>
                      <td className="w-36 py-1 font-mono text-xs">
                        {d.name}
                        {isDirty && <span className="ml-1 text-amber-600">•</span>}
                      </td>
                      <td className="w-64 py-1 text-xs text-slate-600">
                        {d.note}
                        {(d.pitches ?? (d.pitch ? [d.pitch] : [])).length > 0 && (
                          <span className="ml-2">
                            {(d.pitches ?? [d.pitch!]).map((p) => (
                              <button
                                key={p}
                                className="mr-1 rounded border border-slate-200 px-1 text-[10px] hover:bg-white"
                                title={`play at pitch ${p}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  playDef(d, p);
                                }}
                              >
                                ×{p}
                              </button>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className="w-56 py-1">
                        <input
                          type="range"
                          min={MIN_DB}
                          max={MAX_DB}
                          step={0.5}
                          value={db}
                          className="w-52 align-middle"
                          onChange={(e) => update(d.name, dbToTrim(Number(e.target.value)))}
                          onMouseUp={() => playDef(d)}
                          onTouchEnd={() => playDef(d)}
                        />
                      </td>
                      <td className="w-24 py-1 font-mono text-xs">
                        <input
                          type="number"
                          className="w-16 rounded border border-slate-200 px-1 text-right"
                          value={Number(db.toFixed(1))}
                          step={0.5}
                          min={MIN_DB}
                          max={MAX_DB}
                          onChange={(e) => update(d.name, dbToTrim(Number(e.target.value)))}
                        />{" "}
                        dB
                      </td>
                      <td className="w-10 py-1">
                        {isDirty && (
                          <button className="btn-xs" title={`reset to saved (${fmtDb(trimToDb(saved[d.name]))} dB)`} onClick={() => revert([d.name])}>
                            ↺
                          </button>
                        )}
                      </td>
                      <td className="w-48 py-1">
                        <Meter m={m} />
                      </td>
                      <td className="w-40 py-1 font-mono text-[11px] text-slate-600">
                        {m ? `${fmtDb(m.loud, false)} / pk ${fmtDb(m.peak, false)}` : ""}
                      </td>
                      <td className="w-36 py-1 text-[11px]">
                        {sugDb !== undefined && Math.abs(sugDb - db) > 0.25 && (
                          <button
                            className="btn-xs"
                            title="apply the suggested trim"
                            onClick={() => applySuggestions([d.name])}
                          >
                            → {fmtDb(sugDb)} dB
                          </button>
                        )}
                      </td>
                      <td className="py-1 text-right">
                        <label className="text-[10px] text-slate-500">
                          <input
                            type="radio"
                            name="ref"
                            checked={reference === d.name}
                            onChange={() => setReference(d.name)}
                          />{" "}
                          ref
                        </label>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))}
      </main>
      <style>{`
        .btn { border:1px solid #cbd5e1; background:#fff; border-radius:4px; padding:2px 10px; }
        .btn:hover:not(:disabled) { background:#f1f5f9; }
        .btn:disabled { opacity:.45; cursor:default; }
        .btn-primary { background:#0f172a; color:#fff; border-color:#0f172a; }
        .btn-primary:hover:not(:disabled) { background:#1e293b; }
        .btn-xs { border:1px solid #cbd5e1; background:#fff; border-radius:3px; padding:0 6px; font-size:11px; line-height:18px; }
        .btn-xs:hover:not(:disabled) { background:#f1f5f9; }
        .btn-xs:disabled { opacity:.4; cursor:default; }
      `}</style>
    </div>
  );
}
