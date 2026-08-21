// Input sampling: devices -> per-tick InputCommand bitfields. Game logic
// never reads the keyboard or a gamepad directly; it consumes commands. This
// is the netcode seam: an online mode replays remote command streams through
// the same sim.

export const CMD_LEFT = 1;
export const CMD_RIGHT = 2;
/** Jump, and pressed again in the air: the character's air special (double
 *  jump by default; Buford casts the Fishin' Line). The sim makes that call
 *  from jump edges + its own airborne state — no separate command bit. */
export const CMD_JUMP = 4;
export const CMD_BLOW = 8;

export type InputCommand = number;

const SCROLL_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Space",
]);

export type KeyBindings = {
  left: string[];
  right: string[];
  up: string[];
  down: string[];
  jump: string[];
  blow: string[];
};

export const DEFAULT_BINDINGS: [KeyBindings, KeyBindings] = [
  {
    left: ["KeyA"],
    right: ["KeyD"],
    up: ["KeyW"],
    down: ["KeyS"],
    jump: ["KeyW", "KeyF"],
    blow: ["KeyG"],
  },
  {
    left: ["ArrowLeft"],
    right: ["ArrowRight"],
    up: ["ArrowUp"],
    down: ["ArrowDown"],
    jump: ["ArrowUp", "KeyK"],
    blow: ["KeyL"],
  },
];

/**
 * Solo play: nobody is using the arrow cluster, so player 1 answers to both
 * WASD and the arrows (plus Space to jump). Co-op falls back to DEFAULT_BINDINGS.
 */
export const SOLO_BINDINGS: [KeyBindings, KeyBindings] = [
  {
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    up: ["KeyW", "ArrowUp"],
    down: ["KeyS", "ArrowDown"],
    jump: ["KeyW", "KeyF", "ArrowUp", "Space"],
    blow: ["KeyG", "KeyL", "ShiftLeft"],
  },
  DEFAULT_BINDINGS[1],
];

/**
 * Keyboard + gamepad poller. One instance owns the window listeners; call
 * sample(playerIndex) once per sim tick.
 */
export class InputSampler {
  private down = new Set<string>();
  private bindings: [KeyBindings, KeyBindings];
  /** Gamepad index per player, or -1 = keyboard only. */
  padFor: [number, number] = [-1, -1];

  constructor(bindings?: [KeyBindings, KeyBindings]) {
    this.bindings = bindings ?? DEFAULT_BINDINGS;
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("gamepadconnected", this.onPadConnect);
    window.addEventListener("gamepaddisconnected", this.onPadDisconnect);
    this.assignPads();
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onDown);
    window.removeEventListener("keyup", this.onUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("gamepadconnected", this.onPadConnect);
    window.removeEventListener("gamepaddisconnected", this.onPadDisconnect);
  }

  private onDown = (e: KeyboardEvent) => {
    this.down.add(e.code);
    // Arrows and Space scroll the document by default; a bound game key must not.
    if (SCROLL_KEYS.has(e.code) && this.isBound(e.code)) e.preventDefault();
  };
  private onUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
    this.swallowKeys.delete(e.code);
  };
  private onBlur = () => {
    this.down.clear();
    this.swallowKeys.clear();
    this.swallowPad.clear();
  };
  private onPadConnect = () => this.assignPads();
  private onPadDisconnect = () => this.assignPads();

  private assignPads(): void {
    const pads = navigator.getGamepads?.() ?? [];
    const live = [];
    for (let i = 0; i < pads.length; i++) if (pads[i]) live.push(i);
    this.padFor = [live[0] ?? -1, live[1] ?? -1];
  }

  private isBound(code: string): boolean {
    return this.bindings.some((b) =>
      b.left.includes(code) ||
      b.right.includes(code) ||
      b.up.includes(code) ||
      b.down.includes(code) ||
      b.jump.includes(code) ||
      b.blow.includes(code),
    );
  }

  isKeyDown(code: string): boolean {
    return this.down.has(code);
  }

  /** Keys / pad buttons currently held that must NOT reach the sim until
   *  released: call when a menu overlay closes on a press (the A that
   *  confirmed the card must not also jump on the next tick). */
  private swallowKeys = new Set<string>();
  private swallowPad = new Map<number, Set<number>>();
  swallowHeld(): void {
    this.swallowKeys = new Set(this.down);
    this.swallowPad.clear();
    const pads = navigator.getGamepads?.() ?? [];
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pad) continue;
      const held = new Set<number>();
      pad.buttons.forEach((b, bi) => {
        if (b.pressed) held.add(bi);
      });
      if (held.size) this.swallowPad.set(i, held);
    }
  }
  private keyLive(code: string): boolean {
    return this.down.has(code) && !this.swallowKeys.has(code);
  }

  sample(player: 0 | 1): InputCommand {
    const b = this.bindings[player];
    let cmd = 0;
    if (b.left.some((k) => this.keyLive(k))) cmd |= CMD_LEFT;
    if (b.right.some((k) => this.keyLive(k))) cmd |= CMD_RIGHT;
    if (b.jump.some((k) => this.keyLive(k))) cmd |= CMD_JUMP;
    if (b.blow.some((k) => this.keyLive(k))) cmd |= CMD_BLOW;

    const padIdx = this.padFor[player];
    if (padIdx >= 0) {
      const pad = navigator.getGamepads?.()[padIdx];
      if (pad) {
        // swallowed buttons come back once released
        const sw = this.swallowPad.get(padIdx);
        if (sw) for (const bi of [...sw]) if (!pad.buttons[bi]?.pressed) sw.delete(bi);
        const pressed = (bi: number) => !!pad.buttons[bi]?.pressed && !sw?.has(bi);
        const ax = pad.axes[0] ?? 0;
        if (ax < -0.35 || pressed(14)) cmd |= CMD_LEFT;
        if (ax > 0.35 || pressed(15)) cmd |= CMD_RIGHT;
        if (pressed(0)) cmd |= CMD_JUMP; // A / cross (again in air: special)
        if (pressed(2) || pressed(1)) cmd |= CMD_BLOW; // X/B
      }
    }
    return cmd;
  }
}
