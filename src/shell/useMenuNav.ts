// Roving cursor for menu screens. A screen declares how many focusables it
// has (and how many columns they sit in); the hook owns the focus index,
// moves it on menu-input directions (with wrap), fires accept/back/alt, and
// hands each item the props that make mouse and pad agree: hovering moves
// the cursor, clicking accepts, the focused item scrolls into view.
// Callbacks are read through refs so the subscription never churns.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audio } from "../game/audio/engine";
import { menuInput, type MenuEvent } from "./menuInput";

export type MenuNavOptions = {
  count: number;
  /** columns in the grid; 1 = vertical list; `count` = one horizontal row */
  cols?: number;
  wrap?: boolean;
  /** drop every event while false (screen hidden behind a dialog, etc) */
  enabled?: boolean;
  /** which keyboard cluster / pad drives this cursor. "any" = everybody.
   *  0/1 also accept the shared keys (Enter, Esc) unless `strict`. */
  player?: 0 | 1 | "any";
  /** with player 0/1: ignore the shared (player -1) keys too */
  strict?: boolean;
  initial?: number;
  onAccept?: (index: number, e: MenuEvent) => void;
  onBack?: (e: MenuEvent) => void;
  onAlt?: (index: number, e: MenuEvent) => void;
  onAlt2?: (index: number, e: MenuEvent) => void;
  onStart?: (e: MenuEvent) => void;
  onMove?: (index: number, e: MenuEvent) => void;
  /** left/right on a vertical list (volume rows etc); return true to eat it */
  onHorizontal?: (index: number, dir: -1 | 1, e: MenuEvent) => boolean | void;
  /** up/down on a single-row grid (card hands etc) */
  onVertical?: (index: number, dir: -1 | 1, e: MenuEvent) => boolean | void;
  /** any fresh press at all (wake/skip screens) */
  onAny?: (e: MenuEvent) => void;
  /** extra gate after the player filter; return false to drop the event */
  filter?: (e: MenuEvent) => boolean;
  /** tick sfx on move/accept/back (default on) */
  sfx?: boolean;
};

export type ItemBind = {
  ref: (el: HTMLElement | null) => void;
  onMouseEnter: () => void;
  onClick: (ev: React.MouseEvent) => void;
  "data-focused": boolean;
  tabIndex: number;
};

export function menuSfx(kind: "move" | "accept" | "back" | "nope" | "tick"): void {
  audio.ensure();
  audio.playSfx(`menu:${kind}`, 1);
}

export function useMenuNav(opts: MenuNavOptions) {
  const { count, cols = 1, wrap = true, enabled = true, player = "any", strict = false } = opts;
  const [focus, setFocusRaw] = useState(() => Math.max(0, Math.min(count - 1, opts.initial ?? 0)));
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const els = useRef(new Map<number, HTMLElement>());
  const sfx = opts.sfx ?? true;

  // keep focus in range when the item count changes
  useEffect(() => {
    if (count > 0 && focusRef.current >= count) setFocusRaw(count - 1);
  }, [count]);

  const setFocus = useCallback((i: number) => {
    if (i < 0 || i >= optsRef.current.count) return;
    if (focusRef.current === i) return;
    focusRef.current = i;
    setFocusRaw(i);
  }, []);

  // scroll the focused item into view (select grid, long lists)
  useEffect(() => {
    const el = els.current.get(focus);
    el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [focus]);

  useEffect(() => {
    if (!enabled) return;
    const move = (next: number, e: MenuEvent) => {
      const n = optsRef.current.count;
      if (n <= 0) return;
      const clamped = ((next % n) + n) % n;
      if (clamped !== focusRef.current) {
        focusRef.current = clamped;
        setFocusRaw(clamped);
        if (sfx) menuSfx("move");
        optsRef.current.onMove?.(clamped, e);
      }
    };
    const un = menuInput.subscribe((e) => {
      const o = optsRef.current;
      if (player !== "any") {
        if (e.player !== player && (strict || e.player !== -1)) return;
      }
      if (o.filter && !o.filter(e)) return;
      if (e.action === "any") {
        o.onAny?.(e);
        return;
      }
      if (e.repeat && !["up", "down", "left", "right"].includes(e.action)) return;
      const n = o.count;
      const i = focusRef.current;
      const c = Math.max(1, o.cols ?? 1);
      const wrapOn = o.wrap ?? true;
      switch (e.action) {
        case "up": {
          if (c > 1 && c >= n) {
            o.onVertical?.(i, -1, e); // single row: up/down is the screen's business
            return;
          }
          if (n <= 1) return;
          if (c === 1) return move(i - 1, e);
          const t = i - c;
          if (t >= 0) return move(t, e);
          if (!wrapOn) return;
          // wrap to the bottom row, same column (or the last item)
          const col = i % c;
          const lastRowStart = Math.floor((n - 1) / c) * c;
          return move(Math.min(n - 1, lastRowStart + col), e);
        }
        case "down": {
          if (c > 1 && c >= n) {
            o.onVertical?.(i, 1, e);
            return;
          }
          if (n <= 1) return;
          if (c === 1) return move(i + 1, e);
          const t = i + c;
          if (t < n) return move(t, e);
          // a partial last row: "down" still lands on its last item
          if (Math.floor(i / c) < Math.floor((n - 1) / c)) return move(n - 1, e);
          if (!wrapOn) return;
          return move(i % c, e);
        }
        case "left": {
          if (c === 1) {
            o.onHorizontal?.(i, -1, e); // vertical lists: left/right is the row's business
            return;
          }
          const row = Math.floor(i / c);
          const col = i % c;
          if (col > 0) return move(i - 1, e);
          if (!wrapOn) return;
          const rowEnd = Math.min(n - 1, row * c + c - 1);
          return move(rowEnd, e);
        }
        case "right": {
          if (c === 1) {
            o.onHorizontal?.(i, 1, e);
            return;
          }
          const row = Math.floor(i / c);
          const col = i % c;
          const rowEnd = Math.min(n - 1, row * c + c - 1);
          if (col < c - 1 && i < rowEnd) return move(i + 1, e);
          if (!wrapOn) return;
          return move(row * c, e);
        }
        case "accept":
          if (n <= 0) return;
          if (sfx) menuSfx("accept");
          o.onAccept?.(i, e);
          return;
        case "back":
          if (!o.onBack) return;
          if (sfx) menuSfx("back");
          o.onBack(e);
          return;
        case "alt":
          o.onAlt?.(i, e);
          return;
        case "alt2":
          o.onAlt2?.(i, e);
          return;
        case "start":
          if (o.onStart) o.onStart(e);
          else if (o.onAccept && n > 0) {
            if (sfx) menuSfx("accept");
            o.onAccept(i, e);
          }
          return;
      }
    });
    return un;
  }, [enabled, player, strict, sfx]);

  const bind = useCallback(
    (i: number): ItemBind => ({
      ref: (el) => {
        if (el) els.current.set(i, el);
        else els.current.delete(i);
      },
      onMouseEnter: () => {
        if (menuInput.lastDevice === "mouse") setFocus(i);
      },
      onClick: () => {
        setFocus(i);
        menuSfx("accept");
        optsRef.current.onAccept?.(i, {
          action: "accept",
          player: -1,
          device: "mouse",
          repeat: false,
          code: "click",
        });
      },
      "data-focused": focus === i,
      tabIndex: -1,
    }),
    [focus, setFocus],
  );

  return useMemo(() => ({ focus, setFocus, bind }), [focus, setFocus, bind]);
}
