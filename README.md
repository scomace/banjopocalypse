# BANJOPOCALYPSE

A shine-belchin' hootenanny at the end of the world. 99 levels, 9 worlds,
1-2 players on one couch, 12 ridiculous frenzy weapons, a fully procedural
jug-band soundtrack, and a banjo duel with the Devil at the bottom of it.

Original single-screen arcade platformer in the spirit of the classic
belch-trapping genre plus survivors-style weapon frenzies. Every asset is
original: the cast is built from our own aachar character system, every
sprite is hand-placed pixel art defined in code, all 99 layouts are authored
ASCII grids, and the music is synthesized live (Karplus-Strong banjo, jug
bass, washboard, devil fiddle).

## Play

- `npm install`
- `npm run dev` then open the printed URL
- P1: WASD + F (jump) / G (blow) / H (Fishin' Line, Buford only). P2: arrows + K / L / J. Gamepads supported (Y / RB casts the line).
- ESC / Start pauses. Every menu is drivable without a mouse: arrows or d-pad move the cursor, Enter / A picks, Esc / B backs out (a TV remote's arrows + OK + Back work the same). Initials and room codes take typed letters OR an up/down letter wheel, mixed freely; a hint bar on each screen names the live buttons for the device in hand. Swig shine, belch fume-bubbles, trap varmints, pop 'em. Grab glowing mason jars
  for 20 seconds of weapon mayhem. Clear all 99 levels and take back
  Granny's still from Ol' Scratch.

## Stack

Vite + React 18 (shell/menus) + Phaser 3 (render) over a pure-TypeScript
deterministic 60Hz simulation (`src/game/sim`). Character art renders
through the ported aachar paper-doll rig and is baked to spritesheets at
load (`src/aachar/baker.ts`).

## Dev tools (dev server only)

- `/#/admin/aachar` full character editor (saves via the vite plugin)
- `/#/admin/exclaim` comic burst lab
- `/#/admin/baker` bake QA: live rig vs baked sheets
- `?quickstart=1&cast=earl&level=12&seed=5` jump straight into a run
- `npx tsx scripts/sim-smoke.mts` headless sim torture test
- `node scripts/qa-wind.mjs` browser QA for wind (air-special stamina): pips drain, a gassed press stumbles, screenshot in `qa-wind.png` (needs `vite --port 5200`)
- sampled SFX: drop an mp3/wav in `public/sounds/` and register it in `SAMPLE_SFX` (`src/game/audio/engine.ts`); a missing file falls back to synth. `wind-fail.mp3` / `wind-strain.mp3` are the wind slots
- `node scripts/qa-shrine.mjs 5` headless weapon-shrine QA (pedestals, reveal card, test-drive frenzy; needs `vite --port 5200`)
- every level is input-recorded; in the browser console `__banjo.verifyLastReplay()` re-runs the last finished level headless and confirms the tick-perfect hash (`__banjo.verifyReplayNow()` mid-level; `__banjo.lastReplay` is the `{config, log}` itself)
- `node scripts/qa-menu-nav.mjs [keyboard|pad|both]` pointer-free menu QA: walks every shell screen, the pause menu, the intermission and the initials wheel with keyboard-only (what a remote sends) and with a fake gamepad; fails if any screen needs a mouse (needs `vite --port 5200`)
- `node scripts/qa-replay.mjs` browser E2E: real keyboard play, then the page re-simulates its own input log and must hash-match (needs `vite --port 5200`)
- `npm run net:dev` / `npm run net:deploy` — online room server (`server/`, Cloudflare Worker + one Durable Object per room), live at https://banjopocalypse-net.scomace.workers.dev
- `node scripts/qa-room.mjs` room protocol QA against `net:dev`; `ROOM_URL=https://banjopocalypse-net.scomace.workers.dev` to test production
- online play: title → PLAY ONLINE → host shares the 4-letter code (or the invite link, `?room=CODE`); delay-based lockstep over the room relay, state hashes exchanged every second as a desync canary. `?online=host` / `?online=join&room=CODE` (+`&cast=`) is the QA autopilot; `?net=http://127.0.0.1:8787` points the client at `net:dev`
- `node scripts/qa-online.mjs` two-browser lockstep E2E: lobby autopilot, live input both ways, tick-600 hashes must match (needs `vite --port 5200`; `QA_NET=` to override the relay)
- online resilience: a dropped player auto-rejoins their slot (rooms linger 2 min empty) and the resume protocol refills the missed inputs from both send buffers; "WAITIN' ON YER PARTNER" shows during stalls, ping/delay readout bottom-right
- `node scripts/qa-reconnect.mjs` drops the guest's socket mid-level and proves lockstep survives: reconnect, resume, identical hashes after (needs `vite --port 5200`)
- in a quickstart run: `0` clears the level, `9` forces a frenzy, `8` claims the shrine

## Ship

- Web: `npm run deploy` (Cloudflare Pages)
- Desktop/Steam: see `electron/README.md`

Design doc: `docs/DESIGN.md`. Character system reference: `docs/aachar-plan.md`.
