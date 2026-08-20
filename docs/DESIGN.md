# BANJOPOCALYPSE - Design Document v1.1

*A bubble-blowin' hootenanny at the end of the world.*

**Status:** Approved blueprint for a one-shot build. Every decision below was confirmed with Scott (2026-08-14) via Q&A. This file is the single source of truth for the build session.

---

## 1. Pitch

BANJOPOCALYPSE is an original single-screen arcade platformer in the spirit of classic bubble-trapping arcade games, crossed with Vampire Survivors-style auto-fire weapon frenzies - except every weapon is something a banjo-pickin' hillbilly family would actually fight the apocalypse with. 99 handcrafted levels across 9 themed worlds, 1–2 players on one couch, comic-book BOOM bursts, speech-balloon trash talk, and a fully procedural jug-band soundtrack.

**Tone:** upbeat apocalyptic ridiculousness. Duke Nukem swagger × Love and Monsters warmth. The world ended and the family is having a *great* time about it.

**Story:** When the bombs fell, the critters mutated - and Ol' Scratch himself strolled up out of the ground and stole Granny Mae's moonshine still, the beating heart of the holler. The family drank the last batch of Granny's Bubblin' Brew (side effect: you burp indestructible bubbles) and set off across nine ruined counties to get the still back.

### Design pillars
1. **Bubble gameplay is king.** The core loop is 100% trap-and-pop arcade platforming. Vampire Survivors chaos is a *seasoning* - timed frenzies triggered by in-level pickups - never the main dish.
2. **Everything talks.** Comic bursts on every kill chain; speech balloons full of hillbilly one-liners.
3. **One more level.** 99 levels, ~45–90 seconds each, world checkpoints, always a reason to keep going.
4. **Couch-first.** 2P local co-op is a first-class citizen everywhere: revives, banter, shared screen.

### Hard content rules (MANDATORY, from Scott)
1. **No em-dashes anywhere in the game.** Not in barks, UI copy, bursts, menus, credits, store text, code comments that render, anywhere. Use commas, periods, colons, or plain hyphens.
2. **Spiky balloons never come from the speech-balloon system.** If a moment wants a spiky shape, it is an exclaim burst. Speech balloons are rounded and thought only.
3. **`C:\Dev\accountingsurvivor` is READ-ONLY.** Never write, rename, or edit anything there. Anything needed gets copied/ported into this project.
4. **All non-character sprites are original cartoony pixel art**, authored the same way the aachar itemsL/itemsR parts were made (PartCanvas-style pixel art, PNG + atlas, consistent pixel density). No downloaded packs.

### Originality note
This game is *mechanically inspired by* the single-screen bubble-platformer genre. All assets, characters, enemy designs, names, level layouts, music, and text are original. No Taito assets, names, or level data are used or referenced. Character art is Scott's own aachar library (confirmed owned outright); the Badaboom BB font is licensed by Scott.

---

## 2. Tech stack & architecture

| Layer | Choice | Why |
|---|---|---|
| Build | Vite 6+ / TypeScript strict | matches source repo, fast, Pages-friendly |
| Game engine | **Phaser 3** (render, scenes, input, scale, gamepads) | batteries included, best one-shot odds |
| Physics | **Custom fixed-timestep AABB** inside Phaser scenes (not Arcade physics) | bubble-platformer feel needs hand tuning; determinism |
| Shell UI | React 18 + react-router (menus, intermission, admin tools) | aachar/exclaim admin ports nearly as-is |
| Styling (shell only) | Tailwind 3 | admin screens depend on it |
| Audio | Custom WebAudio synth (modeled on accountingsurvivor `lib/sfx/synth.ts` architecture, 100% new content) | zero assets, zero licensing |
| Deploy | Cloudflare Pages via wrangler (scomace GitHub → `banjopocalypse.pages.dev`) | same flow as blinker12 |
| Desktop | Electron-ready structure; wrapper config committed but not built | Steam later |

### Determinism / online-ready hooks (confirmed requirement)
- Fixed 60 Hz simulation tick with accumulator; render interpolates.
- All gameplay randomness through a seeded `mulberry32` PRNG (same algorithm already used in the exclaim lab). Level seed = f(runSeed, levelIndex).
- Input is sampled into per-tick `InputCommand` bitfield structs (`left|right|jump|blow`), fed to the sim - never read directly by game logic. This is the netcode seam: a future online mode replays remote command streams.
- No `Date.now()` in sim; tick count is the only clock.

### Electron-ready rules (enforced throughout)
- No absolute URLs; all asset paths relative. No Node APIs in game/shell code. localStorage behind a `Storage` adapter (swap for file-backed store on Electron). `electron/` folder ships `main.cjs`, `preload.cjs`, packaging script, and a README for the Steam path (steamworks.js, achievements hook points already stubbed in `AchievementBus`).

### Resolution & feel
- Native playfield **960×544** (30×17 tiles @ 32 px), integer-ish letterbox scale to window. HUD overlays outside the tile grid.
- Players ~64 px tall (aachar characters baked at 2×, downscaled crisp).
- Screen wraps vertically (fall off bottom → re-enter top). One-way platforms: jump up through, never drop through.

---

## 3. Ports from `C:\Dev\accountingsurvivor` (file map)

| Source | Destination | Notes |
|---|---|---|
| `lib/aachar/**` (~450 KB src) | `src/aachar/lib/` | wholesale; self-contained except spum renderer + pixeltext |
| `lib/spum/SpumCharacter.tsx` + `types,partAdjustments,freeEye,appearance,curve,clipPhase` | `src/aachar/spum/` | strip `catalog.ts` to the types + 3 helpers AA uses; **do not** bring `propCatalog.ts` (3.5 MB) |
| `lib/aachar/AaSceneCharacter.tsx`, `sceneCast.ts`, `scenePrewarm.ts`, `render.ts` | `src/aachar/runtime/` | the clean runtime loader/renderer path |
| `src/screens/admin-aachar/**` | `src/shell/admin/aachar/` | dev-only route `/admin/aachar`; skip `HorseTab`, `LibraryBrowser`, `ItemPickerModal` (v1) |
| `scripts/vite-aachar-plugin.ts` | `scripts/` + registered in `vite.config.ts` | keep all three save guards (empty-library, shrink-backup, 409 baseHash) |
| `public/aachar/**` (2.6 MB: manifest + 602 part PNGs/atlases) | `public/aachar/` | KEEP the 8 cast bases (Lou, Ida, Adventurer, Adventurer2, Adventurer3, afsdf, Zed2, Zeddington); prune other unused test entries |
| `public/spum/skeleton.json` (71 bones) + `public/spum/anims/*.json` | `public/rig/` | Scott confirms ownership; anims only as fallback for clips AA lacks |
| `src/screens/admin-exclaim/ComicExclaimLab.tsx` | `src/shell/admin/exclaim/` + **extracted runtime** | pull `build*Geometry`, `PALETTES`, `ANIM_CSS`, `sanitizeState` into `src/game/fx/exclaim/` shared module |
| `lib/spum/bubbles.tsx` + `SceneBubble/SceneAnchor` types | `src/game/fx/balloons/` | tailed speech balloons; keep the `kernedText()` measurement invariant |
| `public/fonts/badaboom-bb.ttf` (+ license file) | `public/fonts/` | Scott owns license |
| `@fontsource/press-start-2p` | npm dep | balloon pixel font |
| `lib/sfx/synth.ts` (45 KB) | architecture reference only | new module `src/game/audio/`, 100% new jug-band content |
| `docs/aachar-plan.md` | `docs/aachar-plan.md` | canonical aachar reference; bring along |

### New component: the Sprite Baker (critical path)
The aachar runtime is a DOM paper-doll rig - great for 2 menu characters, too heavy for a game scene. Build `src/aachar/baker/`:
1. At load (and cached in IndexedDB keyed by manifest hash + character name), mount each needed character offscreen via the existing `bakeAaSceneLook()` pipeline (recolor → hatHair → eyes → shading - order matters, it's cached).
2. Sample each required clip at fixed frames by evaluating the bone tracks (reuse `lib/aachar/clip.ts` compile + the renderer's transform math) and composite slices to an offscreen canvas.
3. Emit one Phaser texture atlas + animation defs per character.

Clips needed per player character (mapped from the 35 original AA clips): `idle, move, run, jump(+fall from jump tail), attack_melee→blow, damaged, die, greeting1→victory, sit→level-clear goof`. Menus and the character-select screen keep using the live DOM rig (it looks gorgeous up close); the game uses baked sheets.

---

## 4. Core gameplay

### Movement
Run (walk 4.5 tiles/s), jump (3.5 tiles high, fixed arc), no attack besides bubbles outside frenzies. Coyote time 4 ticks, jump buffer 6 ticks. Bubble-bounce: holding jump while landing on your own bubble bounces you higher (bubble survives 1 bounce, pops on 2nd).

**Air specials + wind.** The second JUMP press midair is the cousin's air special (Earl's honest double, Merle's flutter, Cooter's jugblast, Bobbie Sue's recoil, Zeke's bolt, Granny's toot; Buford casts the Fishin' Line instead and Darlene holds to glide). Air specials run on **wind**: 5 pips, shown under the lives in the HUD. Each special spends one; pips come back one per 2 s with boots on the ground. Gassed out (0 pips), a press is a coin flip rolled ONCE per airtime (no mash-reroll): heads it fires, tails it's a **stumble** (hiccup, a hop at 35% of a double, wobbly legs, `HIC!` burst, a winded bark). The last pips wheeze so the cliff is heard coming. Wind refills on level start, respawn and the Second Pour. Buford's cast and Darlene's chute aren't jumps and cost nothing; boss floors are exempt. Tunables: `WIND_*` in `sim/constants.ts` (`WIND_ENABLED` is the kill switch); logic in `sim/wind.ts`. Sounds: `windStrain` / `windFail` play `public/sounds/wind-strain.mp3` / `wind-fail.mp3` when present (see `SAMPLE_SFX` in `audio/engine.ts`), synth fallback otherwise.

### Bubbles
- **Blow** (X / gamepad B): the character *burps* the bubble out. Every blow plays a small pitch-varied **'hic'** SFX with a tiny hiccup pose twitch. The bubble travels horizontally ~3 tiles (stat/tonic-modified) then floats up, following per-level wind currents (levels define current vector fields; this is the level-design spice).
- Traveling bubble touching an enemy **traps** it. Trapped 6 s, then escapes **angry** (+40% speed, red tint) - angry state resets on re-trap.
- **Pop** a trapped bubble (touch/headbutt) → enemy dies, arcs across screen as a **food item** (score). Pop N trapped bubbles within 0.5 s = **chain**: 1000 × 2^(N-1) points, big comic burst at N≥3 (`KABLOOIE!`, `HOG WILD!`, `YEE-HAW!`).
- Empty bubbles pop on spikes, after 12 s TTL, or when ridden twice.
- Both players' bubbles are shared platforms - co-op bubble-stairway climbing is intended tech.

### Level flow
Clear all enemies → remaining bubbles turn to bonus food → 3 s celebration (character goof animation + balloon bark) → next level. **Hurry Up:** at 45 s, `HURRY UP!` burst; **The Revenuer** spawns - an invincible spectral tax man on a buzzard who homes on the nearest player until the level is cleared.

### Lives, death, co-op (confirmed)
- 3 lives each + earnable extras. Death = lose current frenzy, respawn after 2 s (solo) with brief invulnerability.
- **Co-op revive:** a dead partner drifts across the screen as a ghost in a bubble; pop them to revive (costs one of *their* lives). Out of lives = spectate till next level (auto-rejoin with 1 life every world boundary).
- Continues: 3 per run; a continue restarts the current **world** with arsenal reset to signature weapon.

### Saves (confirmed: world checkpoints)
Auto-unlock at each world start (levels 1, 12, 23…), written the moment the prior boss falls and kept for good. New runs start at any unlocked world. Rescued cousins (`castRescued`) persist the same way (see Rescue cages in section 6). Within-run state (arsenal, lives, score) never persists across sessions. localStorage schema `banjo/v1/{save,scores,settings}` behind the Storage adapter.

---

## 5. Frenzy weapons (the Vampire Survivors layer - confirmed rules)

**Base play never auto-fires.** Mid-level, a **Mason Jar** pickup occasionally materializes (glowing, wobbling, irresistible) stamped with a random weapon icon from that player's arsenal. Grab it → that weapon goes berserk **for ~20 seconds** (VS-style auto-fire layered over normal bubble play), then it's gone. Think invincibility-star economy: a party, not a playstyle.

- Jar spawn cadence: ~1 per 40 s of level time, guaranteed ≥1 in levels 4+ of each world, frequent during bosses.
- Each player's frenzy is independent; simultaneous double-frenzy is a design goal, not a bug.
- Frenzy power = the weapon's current upgrade level (persistent within the run).

### Weapon shrines (confirmed: the only source of new weapons)
You start a run with **only your signature weapon, at Lv1**. New weapons come from the **Weapon Shrine** on **level 5 of every world** (`W` in the level grid): two glowing pedestals under light beams, ringed by **three leashed guardians** (the level's own critters, pinned to ±3 tiles of the shrine). Touch a pedestal and:

1. **Everyone in the party gets that weapon at Lv1** (co-op shares the pick - whoever touches, chooses).
2. Sim holds, full-screen **WEAPON ACQUIRED** card: slam-in title, 8× weapon icon on a ray burst, weapon name, one-liner. Any key dismisses.
3. Every living player's **frenzy lights immediately with the new weapon** - the guardians are the test drive.
4. The other pedestal shatters. An unclaimed shrine **holds the level open** (`CLAIM YER PRIZE!` once the varmints are gone), so a shrine is never wasted.

Offers are seeded from (run seed, level), exclude anything the party already owns, and switch to **relics** once anyone's arsenal is full (6): **The Hootenanny** (every weapon +1 Lv) or **The Forbidden Still** (evolve your highest-level unevolved weapon outright). Five shrine picks fill the arsenal by world 5; worlds 6–9 hand out relics.

### Upgrades (confirmed: between levels)
After every level clear, each player picks **1 of 3 cards** (both players pick simultaneously on a split intermission screen):
- **Weapon upgrade** - level N→N+1 (max 5); at level 5, its **Evolution** card can appear (requires the paired tonic owned, VS-style)
- **Tonic** - passive stat (max 4 tonics)
- **Bonus** fillers, so a hand is always three real choices: **Spare Overalls** (+1 life), **Jar o' Lightnin'** (next level opens in a frenzy), **Coffee Can Savings** (+10,000 pts)

Hand shape: one weapon card whenever one exists, **at most one tonic** (always offered while you hold a single weapon, 65% once Lv-ups compete), then more weapon cards, then bonuses. Levels 1–4 read `Lv-up / tonic / bonus` - four Lv-ups max the signature right as shrine #1 arrives. One free reroll per world, seeded PRNG (rerolls can't fish for shrine offers).

### The arsenal (12 weapons)

| # | Weapon | Behavior (L1) | Scaling L2–L5 | Evolution (L5 + paired tonic) |
|---|---|---|---|---|
| 1 | **Granny's Good Book** | 1 bible orbits slowly | speed, +books (2@L3, 3@L5), damage | **King James Cyclone** - 6 books, pulls enemies inward |
| 2 | **Twang Wave** | banjo chord shockwave ring every 4 s | radius, rate, damage | **Duelin' Banjos** - double echo rings, stuns |
| 3 | **Moonshine Jug** | lobbed jar, fire pool 2 s | +jars, pool size/duration | **White Lightning** - screen-wide splash wave |
| 4 | **Ol' Scattergun** | auto-blast nearest enemy, 3 pellets | +pellets, rate, spread | **Boomstick Bertha** - 360° both-barrels nova |
| 5 | **Possum Posse** | 1 possum patrols platforms, plays dead, bites | +possums, speed | **Possum Stampede** - 8 possums flood the floor |
| 6 | **Jaw Harp Boinger** | bouncing projectile, 4 ricochets | +bounces, +projectiles | **Boingpocalypse** - never stops bouncing for the frenzy |
| 7 | **Washboard Scrub** | rapid melee scrub arc in front | arc size, rate, knockback | **Washboard Abs** - body-contact damage aura |
| 8 | **Chicken Coop** | chicken flaps horizontally across screen | +chickens, eggs drop as bombs | **Fowl Weather** - raining hens |
| 9 | **Spittoon Special** | arcing spit glob, pierces 2 | pierce, size, +globs | **Long-Range Loogie** - full-screen artillery arc |
| 10 | **Lightnin' Rod** | random bolt strikes an enemy every 3 s | rate, chain-jump count | **Act of God** - continuous storm |
| 11 | **Cousin Eddie** | kinfolk linebacker: commits to a direction, headbutt-lunges, bonks off walls, runs off ledges | speed, damage, +cousin@L4 | **Family Reunion** - 3 cousins + granny with a rolling pin |
| 12 | **Hound Dawg** | dog charges nearest enemy, knocks it into bubbles | speed, +dog | **The Howlin'** - pack of 4, howl stuns screen |

### Tonics (passives; also evolution keys)
**Grit** (+damage) · **Rocket-Fuel Shine** (+move speed) · **Lung Butter** (+bubble range/speed) · **Hog Fat** (survive 1 hit per level) · **Lucky Rabbit Foot** (+drops, +jar frequency) · **Extra Pickin' Finger** (+5 s frenzy duration) · **Granny's Spectacles** (+pickup magnet radius) · **Chaw of Immortality** (+1 max life, once per run)

Evolution pairings (weapon → required tonic): Good Book→Spectacles, Twang→Pickin' Finger, Jug→Rocket-Fuel, Scattergun→Grit, Possum→Rabbit Foot, Boinger→Lung Butter, Washboard→Hog Fat, Chicken→Rabbit Foot, Spittoon→Lung Butter, Lightnin'→Pickin' Finger, Eddie→Chaw, Hound→Grit.

**Kin AI (Cousin Eddie / Family Reunion).** Kin are dumb linebackers, not pathfinders: they commit to a direction (facing is locked for 20 ticks after any turn, and only changes with boots on the ground), run straight through varmints, **bonk** off walls (stunned `BONK!`/`OOF!` for 15/24 ticks, then turn once), and run straight off ledges (the vertical wrap brings them back around). They only turn for a varmint on their own floor or within a hop overhead; a target on a higher floor is chased by *climbing*: hop when a shelf is within a jump ahead, or leap off a ledge toward it. A same-floor varmint in front triggers a headbutt **lunge** (2× speed for 10 ticks). Granny is slower, never hops, and swats wider. Nearby-but-unreachable targets never cause pacing or in-place jitter by design. Logic: `stepKin` in `sim/weapons.ts` (`KIN_*` tunables); `npx tsx scripts/qa-eddie.mts` measures flip rate, stuck time, bonks, hops and kills across several layouts.

---

## 6. The cast (8 preset characters - confirmed preset-only, creator later)

All built in the aachar editor as manifest characters tagged `banjo-cast`. Stats are pips 1–5: Speed / Puff (bubble range) / Jump / Luck (drops & jar odds). Signature weapon = always in arsenal from level 1 and starts at L1 (the only weapon until the first shrine).

**Base art (confirmed by Scott):** the 8 cast members are built from these existing accountingsurvivor manifest characters: **Lou, Ida, Adventurer, Adventurer2, Adventurer3, afsdf, Zed2, Zeddington**. Copy them into this project's manifest, rename to the game names below, and ignore their existing item-slot (weapon/weapon2) picks; signature weapons are game systems, not aachar items. The mapping below is provisional; eyeball each rig during the build and swap pairings if a body reads better for a different personality.

| Character | Base aachar | Bio (one-liner) | Sig. weapon | SPD/PUF/JMP/LCK | Unlock |
|---|---|---|---|---|---|
| **Earl** | Adventurer | The responsible twin. Plays a mean five-string. | Twang Wave | 3/3/3/3 | start (P1 default) |
| **Merle** | Adventurer2 | The other twin. Legally distinct from Earl. | Jaw Harp Boinger | 4/3/3/2 | start (P2 default) |
| **Granny Mae** | Ida | Owns the still. Owns everyone in checkers. | Granny's Good Book | 2/3/2/5 | rescue: World 1, level 4 |
| **Cooter** | Lou | Volunteer fire chief. Started most of the fires. | Moonshine Jug | 3/2/3/3 (+2 s frenzy) | rescue: World 3, level 8 |
| **Bobbie Sue** | Adventurer3 | County skeet champ, 9 years runnin'. | Ol' Scattergun | 4/4/2/2 | rescue: World 2, level 6 |
| **Darlene** | afsdf | Talks to possums. They talk back. | Possum Posse | 3/3/3/4 | rescue: World 4, level 6 |
| **Buford** | Zed2 | Once jumped the crick. The *wide* part. | Washboard Scrub | 2/2/5/3 | rescue: World 5, level 8 |
| **Grandpappy Zeke** | Zeddington | Struck by lightning 6 times. Likes it. | Lightnin' Rod | 2/5/2/3 | rescue: World 8, level 9 |

### Rescue cages (confirmed 2026-08-20)

The twins start unlocked so a fresh save can field two players. Everyone else is **met in the levels**: one cousin per listed world sits in a padlocked cage (the level's `R` tile, off the main route but visible from it, never on a shrine or boss level). Each rig is its own art (root-cellar hatch, chain-link lockup, propane tank + chains, gilded sideshow cage, hanging bait cage, storm tower + straps; a back layer draws behind the cousin, a front layer in front) with one shared brass padlock. The caged cousin **calls out** in a speech balloon ~2.5 s into play and every ~9 s after (`cagedLines`, rotating) so the detour gets noticed. Body-check the bars or hit them with a frenzy weapon: **3 hits** pops the lock; the padlock visibly chips and wobbles (whole → cracked → busted) while the cousin eggs you on from the cage ("Harder! It's rusted shut!"), then the JOINED THE KIN banner lands center-screen so the cage corner stays clear. The cousin steps out, does a `victory` bow, gets their line in a balloon, jogs off stage right; food shower + 5000 pts to whoever landed the last hit; `{t:"rescue"}` event → host writes `castRescued` to the save. Either co-op player popping it unlocks for both (save is per machine). The cage is **always present**, even once rescued, so the sim stays save-independent for lockstep; a repeat is just the food and points.

**Fallback so nobody gets soft-locked:** clearing a cousin's world unlocks them regardless (`castUnlocked` in `cast.ts`), which also covers runs started from a later checkpoint. `UNLOCK_ALL_CAST` in `cast.ts` opens the whole roster for testing.

| World | Level | Cousin | The situation |
|---|---|---|---|
| 1 The Holler | 4 | Granny Mae | The still blew. She's in the root cellar under the homestead, door wedged shut, neighbors shuffling on top of it. Practically on the main path: this is the tutorial rescue. *"Took y'all long enough. Who's been in my checkers?"* |
| 2 Flooded Mega-Mart | 6 | Bobbie Sue | Rode out the flood in the sporting-goods lockup, the chain-link cage behind the counter, sniping catfish through the mesh. *"Nine years runnin'. Ten, now."* |
| 3 Meth Lab Caverns | 8 | Cooter | Came down to "investigate the fire hazard." The Chemist's cultists chained him to a glowing propane tank on a ledge under the spikes. *"I was INVESTIGATIN'. Officially."* |
| 4 Radioactive County Fair | 6 | Darlene | Billed as THE POSSUM WHISPERER, 25 cents a look, in a gilded sideshow cage at the end of the big midway platform, six possums stacked on her head. *"Y'all took yer time. The possums was gettin' ideas."* |
| 5 Gator Bayou | 8 | Buford | Tried to jump the bayou. The wide part. Hanging in a gator-hunter's bait cage off a cypress limb over the open water, his own line tangled round it. *"I'd have made it. Wind shifted."* |
| 8 Tornado Alley | 9 | Grandpappy Zeke | Not trapped so much as waiting: strapped to a storm-chaser's weather tower with lightning hitting the rod next to him, delighted. Strike #7 lands as you cut him loose. *"Seven! Told y'all seven was the good one."* |

Worlds 6, 7 and 9 have no cousin cage. Ideas on the shelf: W6 a county prison bus with Cousin Eddie inside (permanent AI kinfolk for the run, or a secret 9th pick); W7 a containment cage holding a spare continue or still parts; W9 no cage, the whole family's already on the porch for the finale.

---

## 7. Worlds & levels (9 × 11 = 99, confirmed)

Level 11 of each world is its boss arena. Each world introduces 2 enemy types, a palette, a music variation, and one level-design mechanic. All 99 layouts authored as ASCII tile grids in `src/game/levels/w{1-9}/l{01-11}.ts` (30×17 chars: `#` solid, `=` one-way platform, `^` spikes, `~` wind current markers, `1`/`2` spawns, `a`–`d` enemy spawns, `J` jar hint, `S` secret door slot).

| W | Name | Vibe / palette | New mechanic | Enemies (archetype) | Boss (L11) |
|---|---|---|---|---|---|
| 1 | **The Holler** | dusk pines, warm greens | basics; gentle updrafts | Rad-Possum (walker), Jackalope (hopper) | **Big Bertha** - mutant prize sow; charges walls, spawns piglets |
| 2 | **The Flooded Mega-Mart** | flickering fluorescents, teal water | rising/falling water shifts wind | Cart Gator (charger), Ceilin'-Fan Bat (floater) | **Colonel Catfish** - surfaces to gulp bubbles; hit him while he gulps |
| 3 | **Meth Lab Caverns** | sickly greens, glassware glow | explosive gas pockets (pop = boom) | Tweeker Gecko (erratic fast walker), Gas Wisp (floater, detonates) | **The Chemist** - raccoon in a gas mask; fills floor with fumes |
| 4 | **Radioactive County Fair** | neon carnival on black | conveyor rides move platforms | Corn-Dog Hound (charger), Balloon Clown (floating spitter) | **Kernel Panic** - 50-ft corn kernel; pops into popcorn swarms |
| 5 | **Gator Bayou** | murk purple, firefly dots | sinking lily-pad platforms | Skeeter (fast floater), Snappin' Turtle (shielded - bubble from behind) | **Swamp Thang** - vine arms grab platforms |
| 6 | **The Interstate Graveyard** | rust orange, tire-fire smoke | burning lanes (timed floor hazards) | Tire-Fire Imp (bouncer), Mufflersnake (long walker) | **Big Rig** - haunted 18-wheeler circles the screen wrap |
| 7 | **The Nuke Plant** | cherenkov blue on concrete | radiation zones enrage enemies | Glow Slime (splitter!), Guv'ment Drone (shooter) | **Meltdown Mel** - cooling-tower golem; meltdown timer phases |
| 8 | **Tornado Alley** | storm green-black, lightning | constant strong wind currents | Cyclone Chick (fast floater), Flyin' Cow (aerial charger) | **The Beefnado** - tornado full of livestock; throws cows |
| 9 | **Scratch's Front Porch** | hellfire red on black wood | all mechanics remixed | Imp Fiddler (shooter), Hellhound (charger) + all-star remixes | **OL' SCRATCH** - see finale |

**Finale (L99):** Ol' Scratch, three phases. P1: classic boss (bubble his hellhound minions, pop them into him). P2: he plays fiddle riffs that spawn note projectiles - the jug-band engine literally duels the boss music. P3: **the banjo duel** - a rhythm-lite volley where popped note-bubbles get returned at him on the beat. Win: the still comes home, the holler party ending rolls (all 8 characters on porch, procedural hoedown at max intensity). No-continue clear → alternate ending stinger.

**Enemy archetypes** (engine-level): walker, hopper, floater, charger, shooter, shielded, splitter, erratic. World enemies are archetype + skin + 1 twist parameter. Angry state = +40% speed globally.

**Secrets:** clear any world's first 10 levels deathless → hidden door on the boss level leads to a **Warp Cellar** (bonus food shower + a free tonic + skip-1-level warp).

---

## 8. Special bubbles, letters, food (confirmed: full moonshine set)

Drifting specials spawn on seeded timers (~1 per 30 s, level-capped):

| Bubble | Pop effect |
|---|---|
| **Moonshine bubble** | flaming flood cascades down platforms, roasting grounded enemies |
| **Lightnin'-in-a-Jar** | horizontal bolt across the row |
| **Skunk bubble** | drifting poison cloud (damages enemies inside) |
| **Hog bubble** | wild hog stampedes the floor, bulldozing enemies off-screen |
| **Prayer bubble** | 5 s invincibility glow + gospel choir sting |

**The Belch Rule (mandatory):** whenever a special bubble's effect activates, the player who popped it rips a **huge belch**: the Mega-Belch SFX (long formant-swept burp that briefly ducks the music), a belch animation beat (head-back, cheeks-puffed; sample the AA `buff` clip into the baked set as `belch`), and a **BRAAAP!-style exclaim burst** above their head. Spiky shapes come from the exclaim system only, never from speech balloons. Small hics for every blow, giant belch for specials: that contrast is the joke, protect it.

**Y-E-E-H-A-W letter bubbles** (rare): complete the word → extra life + 10,000 pts + full-screen `YEE-HAW!` burst. Progress shown on HUD, per player.

**Food** (score items from popped enemies; higher-tier for chains): Pork Rinds 500 · Corn Dog 700 · Moon Pie 1,000 · Squirrel Jerky 2,000 · Possum Pie 3,000 · Deep-Fried Butter 5,000 · Golden Banjo 10,000 (chain ≥5 only).

**Leaderboards (confirmed):** local high-score table per profile + global table, arcade 3-initial entry (yes, it permits rude ones), stored via Storage adapter.

---

## 9. Speech systems (confirmed: both)

### Comic bursts (exclaim runtime - ported geometry/palettes/ANIM_CSS)
Pre-render strategy: at boot, rasterize a pool of common bursts (`POP!`, `KABLOOIE!`, `HURRY UP!`, `YEE-HAW!`, `HOG WILD!`, chain numerals) to textures via the existing SVG→canvas path (font pre-base64'd once); dynamic/rare bursts render as live SVG overlay with per-layer CSS choreography (that's where the charm lives - boss intros, YEEHAW completion, evolutions). Trigger map: chain ≥3, frenzy start, evolution, hurry-up, boss intro/phase/defeat, YEEHAW complete, new high score.

### Speech balloons (bubbles.tsx port)
Bone-anchored (`{kind:"bone", actor, bone:"Head"}`) using the exported per-frame bone transforms; in-game, characters are baked sprites, so the anchor adapter maps sprite position + a per-clip head-offset table instead. Balloon styles: **rounded (speech) and thought only**. The port's spiky/exclamation balloon variant is deleted, per the hard content rules; any alarm or shout moment is an exclaim burst instead. Press Start 2P font, `kernedText()` invariant preserved.

**Bark system:** `src/game/dialog/barks.ts` - per-character line pools × trigger (level intro, first trap, chain, frenzy start, death, revive, partner death, idle 10 s, boss intro/defeat, world intro). ~12 lines per character per major trigger, seeded pick, no repeats within 3 uses. Co-op gets paired exchanges (Earl/Merle bicker tracks). Tone: Duke-Nukem-via-Hee-Haw, PG-13, punching at the apocalypse, never at the family.

---

## 10. Audio (confirmed: procedural jug-band synth, new content, synth.ts architecture as baseline)

`src/game/audio/` - WebAudio, zero asset files.

**Instruments (synthesis):**
- **Banjo** - Karplus-Strong plucked string, bright pluck EQ; roll patterns (forward, backward, forward-reverse) as data
- **Jug bass** - sine + breath-noise attack transient, walking patterns
- **Washboard** - band-passed noise 16ths with accent maps
- **Jaw harp** - comb-filtered twang with pitch-bend envelope
- **Fiddle** - detuned saw + vibrato LFO (boss themes, Scratch duel)
- **Gospel choir** - detuned saw stack + formant filter (prayer bubble, endings)

**Music director:** per-world key/BPM/pattern-seed table (W1 easy G major 100 BPM → W9 E minor 150 BPM devil-fiddle). Intensity layers react to game state: base = banjo+jug; +washboard when ≤3 enemies remain; +fiddle during frenzy; half-time drop on hurry-up until Revenuer spawns (then double-time). Boss themes add fiddle lead. Level-clear = quick tag turnaround; game over = sad solo banjo bend.

**SFX (all synth):** **hic** (short glottal blip, random pitch within a fifth, fires on every bubble blow), bubble launch (filtered noise puff + sine blub layered under the hic), trap (rubbery pitch-up), pop (bandpass snap; chain pops walk up a pentatonic scale, the signature sound), **Mega-Belch** (long formant-swept burp with pitch-drop tail, sidechain-ducks the music ~0.5 s; fires on every special-bubble activation), jump boing, food ding (banjo harmonic), jar grab (glass + swig + burp), each weapon's fire/hit, letter chime, revive gospel hit, boss roars (pitched-down instrument abuse).

Mirrors `lib/sfx/synth.ts` patterns (offline-rendered buffers for hot SFX, live nodes for music; master bus with compressor; mute/volume in settings).

---

## 11. Shell / screens

Title (attract-mode demo loop of AI playing L1) → Profile pick → Character select (live DOM aachar rigs, big and gorgeous; P2 joins with any button) → World select (unlocked checkpoints) → Game → Intermission (cards, split for 2P) → World-clear vignette (balloon skit) → Game over (continue countdown, initials entry) → Leaderboards. Plus: pause (resume/retry/settings/quit), settings (volume ×3, screen shake, reduced flash, key/pad remap), credits.

Dev-only routes (excluded from prod build flag but shippable behind `?dev=1`): `/admin/aachar` (full editor + vite save plugin), `/admin/exclaim` (burst lab), `/admin/level` (nice-to-have: paint ASCII grids visually; build only if time allows).

Input: P1 WASD+F/G (+H: Fishin' Line), P2 arrows+K/L (+J: Fishin' Line) (fully remappable), any 2 gamepads (Phaser gamepad API; Y/RB/RT casts the line), pause = Esc/Start.

Fishin' Line (Buford's perk, `cast.hook`): press HOOK to cast a cane-pole line up-and-forward. It auto-aims across five angles and bites the best platform/wall (most height, biased to ~50°); hold to swing while the reel shortens the line, release to fly off with your momentum, tap JUMP to hop off the line, or reel all the way in to hoist yourself over the snag. A hook that meets a varmint on the way out (or a swinging Buford's boots) sends it tumbling: harmless while airborne, bowls over kin it lands on, chips HP, and can still be bubbled mid-tumble. Sim lives in `sim/hook.ts`.

---

## 12. Project structure

```
c:\Dev\banjopocalypse\
  index.html  vite.config.ts  tailwind.config.ts  wrangler.jsonc  package.json
  scripts/vite-aachar-plugin.ts
  docs/DESIGN.md (this file)  docs/aachar-plan.md
  electron/main.cjs  electron/preload.cjs  electron/README.md
  public/aachar/**  public/rig/skeleton.json  public/rig/anims/**  public/fonts/**
  src/
    main.tsx  router.tsx
    shell/   (React: title, select, intermission, settings, leaderboards, admin/**)
    aachar/  (lib/** spum/** runtime/** baker/**)
    game/
      core/    (loop, rng, input commands, storage adapter, achievement bus)
      physics/ (AABB, one-way platforms, wrap)
      scenes/  (Boot, Play, Boss, Intermission overlay glue)
      bubbles/ weapons/ tonics/ enemies/ bosses/
      levels/  (w1..w9/l01..l11.ts, worlds.ts, parser)
      fx/      (exclaim/, balloons/, particles, screenshake)
      audio/   (instruments/, director, sfx)
      dialog/  (barks.ts, triggers)
      hud/
```

---

## 13. One-shot build plan (phase order + acceptance gates)

1. **Scaffold** - Vite+React+Phaser+Tailwind boots; blank Phaser scene renders; repo pushed; Pages deploy live. ✅ hello-world at banjopocalypse.pages.dev
2. **aachar port** - manifest loads, `/admin/aachar` works with saves; baker emits atlases for all 8 cast members. ✅ Earl idles/runs as a baked sprite in a test scene
3. **Core loop** - physics, movement, bubbles (blow/trap/pop/ride/wrap), one test level, fixed-tick + command input. ✅ feels like the genre; 60 fps
4. **Enemies + score** - 8 archetypes, angry state, food, chains, hurry-up + Revenuer. ✅ full clear of a level end-to-end
5. **Levels** - parser, wind currents, all 99 layouts, world palettes/tilesets (procedural tile skins per world), checkpoint saves. ✅ can play W1 straight through
6. **Frenzy layer** - 12 weapons, jars, 20 s frenzies, intermission cards, tonics, evolutions. ✅ double-frenzy co-op moment works
7. **Specials** - moonshine set, YEEHAW letters, warp cellars, leaderboards. 
8. **Bosses** - 9 bosses + Scratch 3-phase finale + endings.
9. **Speech** - exclaim runtime + pool, balloons + bark content for all 8 characters.
10. **Audio** - instruments, director, all SFX wired.
11. **Shell polish** - all screens, 2P joins, gamepads, settings, attract mode.
12. **Ship** - Electron config, final deploy, self-QA script (scripted playthrough checklist of every system).

### Known risks & mitigations
- **Baker fidelity** (DOM transform math → canvas): reuse the renderer's own math; QA vs live rig side-by-side in `/admin/aachar`. Biggest technical risk - do it second, not last.
- **99 levels of quality**: author via patterns-per-world (each world has 4 layout motifs × variations), hand-tune the seeded generator output into checked-in ASCII - never runtime-generated.
- **Exclaim raster cost**: pre-baked pool at boot; live SVG only for rare big moments.
- **Perf**: object pools for bubbles/projectiles/particles; cap concurrent exclaims (3) and balloons (4).

---

## 14. Confirmed decisions log (Q&A 2026-08-14)

Phaser 3 + React · local co-op with deterministic online-ready core · arcade 99-level campaign, VS layer as pickup-triggered ~20 s frenzies · between-level 1-of-3 upgrade cards · preset cast only (creator later) · both speech systems · 9 worlds × 11 + bosses · procedural jug-band synth (synth.ts architecture, new content) · aachar + Badaboom ownership confirmed by Scott · title **BANJOPOCALYPSE** · Cloudflare Pages deploy + Electron-ready for Steam · 3 lives + bubble revive · full special-bubble set · YEEHAW letters + local leaderboards · world-checkpoint saves.

**v1.1 additions (2026-08-14, same day):** no em-dashes anywhere in the game, mandatory · hic SFX on every bubble blow, huge belch (SFX + animation + exclaim burst) on every special-bubble activation · spiky balloons only ever from the exclaim system, speech balloons are rounded/thought only · cast base art = existing aachar characters Lou, Ida, Adventurer, Adventurer2, Adventurer3, afsdf, Zed2, Zeddington (game names kept, their item picks ignored) · accountingsurvivor is strictly read-only, copy/port only · all non-character sprites are original cartoony pixel art made the way the aachar itemsL/itemsR parts were made.
