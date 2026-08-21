// Shared menu furniture: the focus look, the hint bar that tells the player
// which button does what on the device they're holding, and a device hook
// so copy can say "A" to a pad and "ENTER" to a keyboard or remote.

import { useEffect, useState } from "react";
import { menuInput, type MenuAction, type MenuDevice } from "./menuInput";

/** Re-renders when the player switches between keyboard/remote, pad, mouse. */
export function useDevice(): MenuDevice {
  const [dev, setDev] = useState<MenuDevice>(menuInput.lastDevice);
  useEffect(() => {
    const iv = setInterval(() => {
      if (menuInput.lastDevice !== dev) setDev(menuInput.lastDevice);
    }, 200);
    return () => clearInterval(iv);
  }, [dev]);
  return dev;
}

export type HintAction = MenuAction | "move" | "type" | "updown" | "leftright" | "pad2" | "p2keys";
export type Hint = { action: HintAction; label: string };

type Chip = { text: string; round?: boolean } | null;

/** What to print on the chip for this action on this device. null = no
 *  chip (the action doesn't exist there, e.g. typing on a pad). The pixel
 *  font has no circled-letter glyphs, so pad face buttons are a letter in a
 *  round chip instead. */
function chipFor(action: HintAction, device: MenuDevice): Chip {
  const pad = device === "pad";
  switch (action) {
    case "accept":
      return pad ? { text: "A", round: true } : { text: "ENTER" };
    case "back":
      return pad ? { text: "B", round: true } : { text: "ESC" };
    case "alt":
      return pad ? { text: "X", round: true } : { text: "G/L" };
    case "alt2":
      return pad ? { text: "Y", round: true } : { text: "TAB" };
    case "start":
      return pad ? { text: "START" } : { text: "ENTER" };
    case "move":
      return pad ? { text: "D-PAD" } : { text: "ARROWS" };
    case "updown":
      return { text: "▲▼" };
    case "leftright":
      return { text: "◀▶" };
    case "up":
      return { text: "▲" };
    case "down":
      return { text: "▼" };
    case "left":
      return { text: "◀" };
    case "right":
      return { text: "▶" };
    case "type":
      return pad ? null : { text: "A-Z" };
    case "pad2":
      return { text: "PAD 2" };
    case "p2keys":
      return { text: "K / L" };
    default:
      return null;
  }
}

/** Bottom-of-screen button legend. Pass only the actions that are live. */
export function Hints({ hints, className = "" }: { hints: Hint[]; className?: string }) {
  const device = useDevice();
  return (
    <div
      className={`pointer-events-none flex flex-wrap items-center justify-center gap-x-5 gap-y-1 font-pixel text-[8px] text-white/45 ${className}`}
    >
      {hints.map((h, i) => {
        const chip = chipFor(h.action, device);
        if (!chip) return null;
        return (
          <span key={i} className="flex items-center whitespace-nowrap">
            <span
              className={`mr-1 inline-flex items-center justify-center border border-white/40 text-white/80 ${
                chip.round ? "h-[18px] min-w-[18px] rounded-full px-[3px] text-[9px]" : "px-1 py-[2px]"
              }`}
            >
              {chip.text}
            </span>
            {h.label}
          </span>
        );
      })}
    </div>
  );
}

/** Fixed hint bar for full-screen menus. */
export function HintBar({ hints }: { hints: Hint[] }) {
  return <Hints hints={hints} className="absolute bottom-3 left-0 right-0 z-10" />;
}
