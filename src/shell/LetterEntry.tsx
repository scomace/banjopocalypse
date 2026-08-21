// Letter entry that works for typing AND for a d-pad / remote, on the same
// state so the two mix freely (type "SC", spin the third). N slots plus a
// confirm button as the last focus stop:
//   typing   - a letter fills the active slot and advances; Backspace erases
//   wheel    - up/down spins the active slot through the alphabet (hold to
//              repeat), left/right moves between slots, accept advances / confirms
//   mouse    - click a slot to pick it, click its ▲▼ to spin, click CONFIRM
// Used by the initials screen and the online room-code field.

import { useEffect, useRef, useState } from "react";
import { audio } from "../game/audio/engine";
import { menuInput } from "./menuInput";
import { Hints } from "./MenuChrome";
import { menuSfx } from "./useMenuNav";

export const INITIALS_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ .!?'-";
export const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function LetterEntry({
  length,
  initial = "",
  onChange,
  onConfirm,
  onCancel,
  alphabet = INITIALS_ALPHABET,
  confirmLabel = "CARVE IT",
  enabled = true,
  big = true,
  hints = true,
}: {
  length: number;
  /** seed text (last initials, a deep-linked room code) */
  initial?: string;
  /** best-effort live text (empties as spaces, trailing trimmed) */
  onChange?: (v: string) => void;
  /** fired with the full value when every slot is filled and the player confirms */
  onConfirm: (v: string) => void;
  /** back on an empty first slot (skip / leave) */
  onCancel?: () => void;
  alphabet?: string;
  confirmLabel?: string;
  enabled?: boolean;
  big?: boolean;
  hints?: boolean;
}) {
  const [chars, setChars] = useState<string[]>(() =>
    Array.from({ length }, (_, i) => (initial[i] && alphabet.includes(initial[i]) ? initial[i] : "")),
  );
  const [active, setActive] = useState(0);
  const stateRef = useRef({ chars, active });
  stateRef.current = { chars, active };
  const cbRef = useRef({ onChange, onConfirm, onCancel });
  cbRef.current = { onChange, onConfirm, onCancel };

  const full = chars.every((c) => c !== "");

  const setChar = (i: number, ch: string) => {
    const cs = [...stateRef.current.chars];
    cs[i] = ch;
    stateRef.current = { ...stateRef.current, chars: cs };
    setChars(cs);
    cbRef.current.onChange?.(cs.map((c) => c || " ").join("").trimEnd());
  };

  const spin = (dir: 1 | -1) => {
    const { active: a, chars: cs } = stateRef.current;
    if (a >= length) return;
    const cur = cs[a] ?? "";
    let idx = cur ? alphabet.indexOf(cur) : -1;
    if (idx < 0) idx = dir > 0 ? -1 : 0; // empty: up -> first, down -> last
    const next = (idx + dir + alphabet.length) % alphabet.length;
    setChar(a, alphabet[next]);
    audio.playSfx("letter", 1 + a * 0.15);
  };

  const typed = (ch: string) => {
    const { active: a } = stateRef.current;
    const slot = a >= length ? length - 1 : a;
    if (!alphabet.includes(ch)) return;
    setChar(slot, ch);
    audio.playSfx("letter", 1 + slot * 0.15);
    if (slot < length - 1) setActive(slot + 1);
    else setActive(length); // last letter typed: park on CONFIRM
  };

  const confirm = () => {
    const cs = stateRef.current.chars;
    if (cs.every((c) => c !== "")) {
      menuSfx("accept");
      cbRef.current.onConfirm(cs.join(""));
    } else {
      menuSfx("nope");
      setActive(cs.findIndex((c) => c === ""));
    }
  };

  const erase = () => {
    const { active: a, chars: cs } = stateRef.current;
    if (a >= length) {
      setActive(length - 1);
      return;
    }
    if (cs[a]) {
      setChar(a, "");
      menuSfx("back");
    } else if (a > 0) {
      setChar(a - 1, "");
      setActive(a - 1);
      menuSfx("back");
    } else if (cbRef.current.onCancel) {
      menuSfx("back");
      cbRef.current.onCancel();
    }
  };

  useEffect(() => {
    if (!enabled) return;
    return menuInput.subscribe((e) => {
      const { active: a, chars: cs } = stateRef.current;
      // typing: any printable key in the alphabet types, INCLUDING the keys the
      // menu layer also routes as nav (W/A/S/D/F/G/K/L, Space). Those arrive
      // twice (their action + "any"); the "any" copy types, the action copy is
      // dropped below.
      const isTypedChar = e.device === "keyboard" && !!e.char && alphabet.includes(e.char);
      if (e.action === "any") {
        if (isTypedChar && !e.repeat) typed(e.char!);
        return;
      }
      if (isTypedChar) return;
      switch (e.action) {
        case "up":
          if (a < length) spin(1);
          return;
        case "down":
          if (a < length) spin(-1);
          return;
        case "left":
          if (e.repeat) return;
          if (a > 0) {
            setActive(a - 1);
            menuSfx("move");
          }
          return;
        case "right":
          if (e.repeat) return;
          if (a < length) {
            setActive(a + 1);
            menuSfx("move");
          }
          return;
        case "accept":
        case "start": {
          if (e.repeat) return;
          if (a >= length || cs.every((c) => c !== "")) {
            confirm();
          } else if (cs[a]) {
            setActive(a + 1);
            menuSfx("move");
          } else {
            // accept on an empty slot: start it at the first letter
            spin(1);
          }
          return;
        }
        case "back":
          if (e.repeat) return;
          erase();
          return;
        default:
          break;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, length, alphabet]);

  const slotW = big ? "h-16 w-14" : "h-12 w-10";
  const slotFont = big ? "text-4xl" : "text-2xl";
  const neighbor = (i: number, dir: 1 | -1) => {
    const cur = chars[i];
    let idx = cur ? alphabet.indexOf(cur) : dir > 0 ? -1 : 0;
    if (idx < 0) idx = -1;
    return alphabet[(idx + dir + alphabet.length) % alphabet.length];
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-3">
        {chars.map((c, i) => {
          const isActive = active === i;
          return (
            <div key={i} className="flex flex-col items-center">
              <button
                className="h-7 font-display text-xl leading-none text-white/30 hover:text-white"
                style={{ visibility: isActive ? "visible" : "hidden" }}
                tabIndex={-1}
                title="spin up"
                onClick={() => {
                  setActive(i);
                  spin(1);
                }}
              >
                {neighbor(i, 1) === " " ? "␣" : neighbor(i, 1)}
              </button>
              <button
                className={`flex ${slotW} items-center justify-center border-2 font-display ${slotFont} text-white transition-transform`}
                style={{
                  borderColor: isActive ? "#E8B928" : "#5a4a30",
                  boxShadow: isActive ? "4px 4px 0 #000" : "none",
                  transform: isActive ? "scale(1.06)" : "scale(1)",
                  background: "rgba(0,0,0,0.45)",
                }}
                tabIndex={-1}
                data-slot={i}
                onClick={() => setActive(i)}
              >
                {c === " " ? "␣" : c || (isActive ? "_" : "")}
              </button>
              <button
                className="h-7 font-display text-xl leading-none text-white/30 hover:text-white"
                style={{ visibility: isActive ? "visible" : "hidden" }}
                tabIndex={-1}
                title="spin down"
                onClick={() => {
                  setActive(i);
                  spin(-1);
                }}
              >
                {neighbor(i, -1) === " " ? "␣" : neighbor(i, -1)}
              </button>
            </div>
          );
        })}
        <button
          className={`ml-3 border-2 px-4 py-2 font-display text-xl uppercase transition-colors ${
            full ? "text-[#E8B928]" : "text-white/30"
          }`}
          style={{
            borderColor: active === length ? "#E8B928" : full ? "#8a7a40" : "#3a3020",
            boxShadow: active === length ? "4px 4px 0 #000" : "none",
            background: active === length && full ? "#E8B928" : "rgba(0,0,0,0.45)",
            color: active === length && full ? "#000" : undefined,
          }}
          tabIndex={-1}
          onMouseEnter={() => menuInput.lastDevice === "mouse" && setActive(length)}
          onClick={() => {
            setActive(length);
            confirm();
          }}
        >
          {confirmLabel}
        </button>
      </div>
      {hints && (
        <Hints
          hints={[
            { action: "type", label: "TYPE" },
            { action: "updown", label: "SPIN" },
            { action: "leftright", label: "SLOT" },
            { action: "accept", label: full ? confirmLabel : "NEXT" },
            { action: "back", label: "ERASE" },
          ]}
        />
      )}
    </div>
  );
}
