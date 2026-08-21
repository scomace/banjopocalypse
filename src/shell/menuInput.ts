// Menu input: one layer that turns keyboard, gamepad and TV-remote presses
// into abstract menu actions (up/down/left/right/accept/back/start/alt/any)
// and broadcasts them to whoever is listening. Every menu screen and every
// in-game overlay subscribes here instead of owning a window keydown handler,
// so the whole shell is drivable with no pointer. The sim keeps its own
// InputSampler; this layer only knows about edges, repeats and devices.
//
// Keyboard: arrows + WASD move, Enter/Space/F/K accept, Esc/Backspace back.
//   WASD+F/G are attributed to P1, arrows+K/L to P2 (only the two-player
//   screens care); Enter/Space/Esc belong to everybody (player -1).
// Gamepad (standard mapping, polled on rAF): d-pad / left stick move, A
//   accept, B back, X/Y alt, Start start. First connected pad is P1.
// Remote: arrives as keyboard events with only arrows + Enter + Back (webOS
//   461, Tizen 10009, "GoBack"/"BrowserBack", Android TV Escape/Backspace).
//   Remotes that never deliver a key at all are caught by the history trap:
//   a dummy history entry is kept pushed and popstate reads as "back".

import { audio } from "../game/audio/engine";

export type MenuAction =
  | "up"
  | "down"
  | "left"
  | "right"
  | "accept"
  | "back"
  | "start"
  | "alt" // X on pad, Y on keyboard-ish screens that want a third action
  | "alt2" // Y on pad
  | "any"; // a press of anything (emitted alongside the specific action)

export type MenuDevice = "keyboard" | "pad" | "mouse";

export type MenuEvent = {
  action: MenuAction;
  /** 0 = P1 cluster/pad, 1 = P2 cluster/pad, -1 = shared (Enter, Esc, ...) */
  player: 0 | 1 | -1;
  device: MenuDevice;
  /** held key/direction auto-repeat (lists accept these, buttons don't) */
  repeat: boolean;
  /** keyboard: the KeyboardEvent.code; pad: `pad:N` / `axis:N` */
  code: string;
  /** keyboard only: a single printable character, uppercased ("A", "1", " ") */
  char?: string;
};

export type MenuListener = (e: MenuEvent) => void;

const BACK_CODES = new Set(["Escape", "Backspace", "GoBack", "BrowserBack"]);
const BACK_KEYCODES = new Set([461 /* webOS */, 10009 /* Tizen */, 166 /* BrowserBack */]);
const P1_CODES = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyF", "KeyG"]);
const P2_CODES = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyK", "KeyL"]);
const KEY_ACTION: Record<string, MenuAction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  KeyW: "up",
  KeyS: "down",
  KeyA: "left",
  KeyD: "right",
  Enter: "accept",
  NumpadEnter: "accept",
  Space: "accept",
  KeyF: "accept",
  KeyK: "accept",
  KeyG: "alt",
  KeyL: "alt",
  Tab: "alt2",
};
/** Keys the browser would otherwise act on (scroll, back-navigate, etc). */
const SWALLOW = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "Backspace",
  "Tab",
  "GoBack",
  "BrowserBack",
]);

const PAD_BUTTON_ACTION: Record<number, MenuAction> = {
  0: "accept", // A / cross
  1: "back", // B / circle
  2: "alt", // X / square
  3: "alt2", // Y / triangle
  9: "start",
  12: "up",
  13: "down",
  14: "left",
  15: "right",
};
const DIRECTIONS = new Set<MenuAction>(["up", "down", "left", "right"]);
const REPEAT_FIRST_MS = 320;
const REPEAT_NEXT_MS = 95;
const STICK_ON = 0.55;
const STICK_OFF = 0.35;

type HeldDir = { action: MenuAction; since: number; nextAt: number };

class MenuInputImpl {
  private listeners = new Set<MenuListener>();
  private raf = 0;
  private running = false;
  /** pad index -> button pressed state last frame */
  private padDown = new Map<number, boolean[]>();
  /** pad index -> engaged stick direction (hysteresis) */
  private stick = new Map<number, { x: -1 | 0 | 1; y: -1 | 0 | 1 }>();
  /** repeat timers for held pad directions, keyed `pad:dir` */
  private held = new Map<string, HeldDir>();
  private trapArmed = false;
  lastDevice: MenuDevice = "keyboard";
  /** true once any press has been seen this session (title wake) */
  touched = false;

  start(): void {
    if (this.running) return;
    this.running = true;
    window.addEventListener("keydown", this.onKey, { capture: true });
    window.addEventListener("pointerdown", this.onPointer, { capture: true });
    window.addEventListener("mousemove", this.onMouseMove, { passive: true });
    window.addEventListener("popstate", this.onPop);
    this.armTrap();
    this.raf = requestAnimationFrame(this.poll);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    window.removeEventListener("keydown", this.onKey, { capture: true });
    window.removeEventListener("pointerdown", this.onPointer, { capture: true });
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("popstate", this.onPop);
    cancelAnimationFrame(this.raf);
  }

  subscribe(fn: MenuListener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Gamepad index per player slot (first connected pad is P1). */
  padOrder(): number[] {
    const pads = navigator.getGamepads?.() ?? [];
    const live: number[] = [];
    for (let i = 0; i < pads.length; i++) if (pads[i]) live.push(i);
    return live;
  }

  padsConnected(): number {
    return this.padOrder().length;
  }

  private emit(e: MenuEvent): void {
    this.touched = true;
    for (const fn of [...this.listeners]) fn(e);
  }

  // ------------------------------------------------------------ keyboard

  private onKey = (ev: KeyboardEvent) => {
    // text fields (dev tools, the admin routes) keep their keys
    const t = ev.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    this.lastDevice = "keyboard";
    audio.ensure();
    const code = ev.code || ev.key;
    let action: MenuAction | null = null;
    if (BACK_CODES.has(code) || BACK_CODES.has(ev.key) || BACK_KEYCODES.has(ev.keyCode)) {
      action = "back";
    } else if (KEY_ACTION[code]) {
      action = KEY_ACTION[code];
    }
    if (SWALLOW.has(code) || action === "back") ev.preventDefault();
    const player: 0 | 1 | -1 = P1_CODES.has(code) ? 0 : P2_CODES.has(code) ? 1 : -1;
    const char = ev.key.length === 1 ? ev.key.toUpperCase() : undefined;
    const base = { player, device: "keyboard" as const, repeat: ev.repeat, code, char };
    if (action) this.emit({ ...base, action });
    // "any": every fresh press, so wake/skip screens can listen for one thing
    if (!ev.repeat) this.emit({ ...base, action: "any" });
  };

  private onPointer = () => {
    this.lastDevice = "mouse";
    this.touched = true;
    audio.ensure();
  };
  private onMouseMove = () => {
    this.lastDevice = "mouse";
  };

  // ------------------------------------------------------------ history trap

  private armTrap(): void {
    if (this.trapArmed) return;
    this.trapArmed = true;
    try {
      history.pushState({ banjoTrap: true }, "", location.href);
    } catch {
      /* sandboxed; no trap */
    }
  }
  private onPop = () => {
    // Back on a remote/browser: read it as menu back and re-arm
    this.emit({ action: "back", player: -1, device: "keyboard", repeat: false, code: "HistoryBack" });
    this.emit({ action: "any", player: -1, device: "keyboard", repeat: false, code: "HistoryBack" });
    try {
      history.pushState({ banjoTrap: true }, "", location.href);
    } catch {
      /* ignore */
    }
  };

  // ------------------------------------------------------------ gamepads

  private poll = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.poll);
    const pads = navigator.getGamepads?.() ?? [];
    const order = this.padOrder();
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pad) continue;
      const slot = order.indexOf(i);
      const player: 0 | 1 | -1 = slot === 0 ? 0 : slot === 1 ? 1 : -1;
      const prev = this.padDown.get(i) ?? [];
      const cur: boolean[] = [];
      for (let b = 0; b < pad.buttons.length; b++) {
        const down = pad.buttons[b]?.pressed ?? false;
        cur[b] = down;
        const was = prev[b] ?? false;
        const action = PAD_BUTTON_ACTION[b];
        const key = `${i}:b${b}`;
        if (down && !was) {
          this.lastDevice = "pad";
          if (action) {
            this.emit({ action, player, device: "pad", repeat: false, code: `pad:${b}` });
            if (DIRECTIONS.has(action)) {
              this.held.set(key, { action, since: now, nextAt: now + REPEAT_FIRST_MS });
            }
          }
          this.emit({ action: "any", player, device: "pad", repeat: false, code: `pad:${b}` });
        } else if (!down && was) {
          this.held.delete(key);
        }
      }
      this.padDown.set(i, cur);

      // left stick with hysteresis -> synthetic d-pad
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      const st = this.stick.get(i) ?? { x: 0, y: 0 };
      const nx: -1 | 0 | 1 = ax < -STICK_ON ? -1 : ax > STICK_ON ? 1 : Math.abs(ax) < STICK_OFF ? 0 : st.x;
      const ny: -1 | 0 | 1 = ay < -STICK_ON ? -1 : ay > STICK_ON ? 1 : Math.abs(ay) < STICK_OFF ? 0 : st.y;
      const stickEdge = (axis: "x" | "y", before: number, after: number) => {
        if (before === after) return;
        const offKey = `${i}:${axis}${before}`;
        this.held.delete(offKey);
        if (after === 0) return;
        const action: MenuAction =
          axis === "x" ? (after < 0 ? "left" : "right") : after < 0 ? "up" : "down";
        this.lastDevice = "pad";
        this.emit({ action, player, device: "pad", repeat: false, code: `axis:${axis}` });
        this.emit({ action: "any", player, device: "pad", repeat: false, code: `axis:${axis}` });
        this.held.set(`${i}:${axis}${after}`, { action, since: now, nextAt: now + REPEAT_FIRST_MS });
      };
      stickEdge("x", st.x, nx);
      stickEdge("y", st.y, ny);
      this.stick.set(i, { x: nx, y: ny });

      // held-direction repeats
      for (const [key, h] of this.held) {
        if (!key.startsWith(`${i}:`)) continue;
        if (now >= h.nextAt) {
          h.nextAt = now + REPEAT_NEXT_MS;
          this.emit({ action: h.action, player, device: "pad", repeat: true, code: key });
        }
      }
    }
    // drop repeat state for pads that vanished
    for (const key of [...this.held.keys()]) {
      const idx = Number(key.split(":")[0]);
      if (!pads[idx]) this.held.delete(key);
    }
  };
}

export const menuInput = new MenuInputImpl();

/** Device-flavoured button glyphs for hint bars. */
export function glyph(action: MenuAction | "move" | "type", device: MenuDevice = menuInput.lastDevice): string {
  if (device === "pad") {
    switch (action) {
      case "accept":
        return "Ⓐ";
      case "back":
        return "Ⓑ";
      case "alt":
        return "Ⓧ";
      case "alt2":
        return "Ⓨ";
      case "start":
        return "START";
      case "move":
        return "✚";
      case "up":
        return "▲";
      case "down":
        return "▼";
      case "left":
        return "◀";
      case "right":
        return "▶";
      case "type":
        return "✚";
      default:
        return "";
    }
  }
  switch (action) {
    case "accept":
      return "ENTER";
    case "back":
      return "ESC";
    case "alt":
      return "G/L";
    case "alt2":
      return "TAB";
    case "start":
      return "ENTER";
    case "move":
      return "ARROWS";
    case "up":
      return "▲";
    case "down":
      return "▼";
    case "left":
      return "◀";
    case "right":
      return "▶";
    case "type":
      return "TYPE";
    default:
      return "";
  }
}
