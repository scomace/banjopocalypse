// Input sampling: devices -> per-tick InputCommand bitfields. Game logic
// never reads the keyboard or a gamepad directly; it consumes commands. This
// is the netcode seam: an online mode replays remote command streams through
// the same sim.

export const CMD_LEFT = 1;
export const CMD_RIGHT = 2;
export const CMD_JUMP = 4;
export const CMD_BLOW = 8;

export type InputCommand = number;

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
  };
  private onUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
  };
  private onBlur = () => {
    this.down.clear();
  };
  private onPadConnect = () => this.assignPads();
  private onPadDisconnect = () => this.assignPads();

  private assignPads(): void {
    const pads = navigator.getGamepads?.() ?? [];
    const live = [];
    for (let i = 0; i < pads.length; i++) if (pads[i]) live.push(i);
    this.padFor = [live[0] ?? -1, live[1] ?? -1];
  }

  isKeyDown(code: string): boolean {
    return this.down.has(code);
  }

  /** Any button on any pad, or any of the given key codes — for "press to join". */
  anyPress(codes: string[]): boolean {
    if (codes.some((c) => this.down.has(c))) return true;
    const pads = navigator.getGamepads?.() ?? [];
    for (const pad of pads) {
      if (pad?.buttons.some((b) => b.pressed)) return true;
    }
    return false;
  }

  sample(player: 0 | 1): InputCommand {
    const b = this.bindings[player];
    let cmd = 0;
    if (b.left.some((k) => this.down.has(k))) cmd |= CMD_LEFT;
    if (b.right.some((k) => this.down.has(k))) cmd |= CMD_RIGHT;
    if (b.jump.some((k) => this.down.has(k))) cmd |= CMD_JUMP;
    if (b.blow.some((k) => this.down.has(k))) cmd |= CMD_BLOW;

    const padIdx = this.padFor[player];
    if (padIdx >= 0) {
      const pad = navigator.getGamepads?.()[padIdx];
      if (pad) {
        const ax = pad.axes[0] ?? 0;
        if (ax < -0.35 || pad.buttons[14]?.pressed) cmd |= CMD_LEFT;
        if (ax > 0.35 || pad.buttons[15]?.pressed) cmd |= CMD_RIGHT;
        if (pad.buttons[0]?.pressed) cmd |= CMD_JUMP; // A / cross
        if (pad.buttons[2]?.pressed || pad.buttons[1]?.pressed) cmd |= CMD_BLOW; // X/B
      }
    }
    return cmd;
  }

  pausePressed(): boolean {
    if (this.down.has("Escape")) return true;
    const pads = navigator.getGamepads?.() ?? [];
    return pads.some((p) => p?.buttons[9]?.pressed);
  }
}
