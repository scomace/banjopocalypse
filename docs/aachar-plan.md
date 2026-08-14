# AA character pipeline — implementation plan

> **Active process doc.** A second, isolated character-authoring pipeline at
> `/admin/aachar` for an original base model with non-SPUM proportions. The
> existing SPUM setup (`/admin/spum`, `lib/spum/catalog.ts`, `public/spum/`)
> must keep working **byte-for-byte unchanged** so we can go back to it.
>
> Animation was deliberately held until a character existed, since proportions
> change how every clip reads. That is Phase 6, and it has shipped — the clips
> are now original data on the engine's bone paths and durations.

Status legend: `⚪ not started` · `🟡 in progress` · `🟢 done` · `🔴 blocked`

---

## 0. Start here

**Where it stands (2026-07-30):** Phases 1–6 done, including the 6b/6c rig
study + clip re-authoring, and the clip library is now **COMPLETE**: 42 clips
covering **every engine clip name** live in `lib/aachar/clips/` — the
unreferenced tail (`jump`, `die`, `sit`, `sleep`, the weapon attacks, …) was
closed 2026-07-30, so **no engine name resolves to SPUM's motion anymore**
(the fall-through mechanism survives only as a safety net for names added to
the engine later). All authored against this rig's measured levers
(`lib/aachar/rig.ts`), reviewed pose-by-pose on the real character, and gated
by test against being scaled copies of SPUM's motion. The editor at `/admin/aachar` can author a
whole character AND its motion; a real character is saved, and a character can
recolour tagged parts of the art it wears (Phase 5e). **Phase 8 shipped
(2026-07-29):** any prop / sprite frame / modern-pack item — plus, since
2026-08-04, any registered item R / item L part (the browser's "items" tab) —
imports as hat/clothing/item art at its original resolution, losslessly
resizable, smooth or crisp per part ("Browse library…" in the Slots tab), and
editable pixel-by-pixel at native resolution (draw / erase / eyedropper in the
hi-res editor, 2026-08-04). **Phase 9
shipped (2026-07-29):** text stamping — six hand-authored bitmap fonts
(`lib/pixeltext/`, see `docs/pixel-text.md`) with a "Text" tool on every
slot's canvas. **Phase 10 shipped (2026-07-29):** outfit presets — save a
character's look (picks + colours + appearance + placement, never the build)
as a named outfit any character can wear — plus suggested names for new
characters and outfits. **Phase 11 shipped (2026-07-30):** three eye states
(open / half / closed) as a render-time band swap — third `FreeHalf` sheet
band, per-character resting state, per-clip whole-clip state, all gated on
save-time has-art flags so old parts render unchanged. **Phase 12 shipped
(2026-07-30):** pupils — eye boxes + pupil marks on the part (Eyes tool,
auto-detect), per-eye pixel nudge on the character, gaze ("looking up-left")
as a whites-clamped pixel pass, previewable in the editor and settable per
clip. **Phase 13 shipped (2026-07-30):** auto-shading + shadows — parts are
authored FLAT and a render pass generates the rim shade (in ramp space, light
direction as a parameter: left/top/right/below-for-campfire) plus a
composited ground shadow (ellipse or pose-following silhouette). **Phase 14
shipped (2026-07-30):** theme tags — `AaPart.tags` (chips in the Slots tab)
with a pre-checked "🎲 excludes" filter so themed parts (the zombie set:
3-band `zombieeyes`, `zombiemouth`, `shirtpantstorn`, plus 14b's tatter pass:
36 generated `*torn` cloths, three more 3-band eyes, three mouths) stay out
of random villagers by default, plus `AaColorChannel.randomPalette` so the
skin channel rolls curated skin tones instead of any hue. **14d added the
raider set** (🪓 button, 44 `raider`-tagged parts from
`scripts/aachar-raider-gen.js`, human skin via the empty-palette deferral),
**14e the robot set** (🤖 button, 6 `robot`-tagged parts from
`scripts/aachar-robot-gen.js` incl. two full chassis bodies painted metal
through the `skin` channel), **14f the skeleton set** (💀 button, bone
chassis + sockets from `scripts/aachar-skeleton-gen.js`; the torn cloths
are dual-tagged `zombie` + `skeleton` — the first theme-shared art),
**14g the cultist set** (🕯️ button, robes/hood/trance eyes from
`scripts/aachar-cultist-gen.js`; gold on a dedicated `sigil` channel).
**14h the professor set** (2026-08-08, `scripts/aachar-professor-gen.js`,
**registered** rather than staged): four cloths (`shirtpantstweed`,
`shirtpantscardigan`, `shirtpantsvestbow`, `shirtpantsdoctoral`) and four
hats (`tam`, `beret`, `gradcaptilt`, `browglasses`), untagged so they stay in
the random-villager pool like ordinary clothes. Its four companion ITEMS —
`chalkslate` (a slate with a T-account chalked on it), `pointer`,
`chalkeraser`, `textbook` — are Chunk L in `scripts/aachar-weapon-gen.js`.
**14i the helmet set** (2026-08-08, `scripts/aachar-helmet-gen.js`,
registered): seven skull-gripping HELMETS (`barbute` `centurion`
`spangenhelm` `motohelm` `gridiron` `divinghelm` `pilothelm`) plus a
`*back` for each — the same helmet worn backwards, shell over the face.
They live in sheet rows 24-37, NOT the 19-29 band every other hat uses,
because that band sits on hair rather than on the skull; the measured head
frame and its build-time checks are in the generator's header.
The generator's header records the two frames it had to measure: the cloth
silhouette every shipped shirt shares (and that no cloth part has EVER
carried sleeve art, so elbow patches are not available at 17x9), and the fact
that hats are drawn to seat on **hair**, not on the bare skull — a hem at
rows 24-26 floats several px over a bald head, which is why the fedora and
gradcap look wrong on one. Match a shipped hat's row band rather than
deriving a seat height.
**Phase 7 (content integration) SHIPPED (2026-07-30):** scenes cast an AA
character by name — `SceneActor.aachar: { name: "Ida", hide?: [...] }` —
and get the character's full editor look, AA clips, and the same
bone-anchor plumbing SPUM actors had. Authoring guide:
**`docs/spum-scene-authoring.md` §25**; first shipped use is
`unit1-lesson1b-ex8` (Ida). SPUM is now LEGACY for new scenes, and old
scenes are being migrated actor by actor.

**The character's data lives in two places, both verified:**
- `public/aachar/manifest.json` + `public/aachar/parts/<slot>/AA_*.png`
- a `.aachar.json` export bundle the user holds, with every PNG inlined

⚠️ **Never `rm -rf public/aachar`.** That directory holds real authored art.
Scope test cleanups to the specific files a test wrote (see I8).

**Verify loop:** `npx tsc --noEmit` · `npx vitest run` (1357 passing, 270 in
`lib/aachar/`) · `npm run lint`. For UI changes, boot `npx vite --port <free>`
and check the module transforms *and* that the thing actually renders — a 200
on a module is not proof it works (that mistake shipped a broken preview).
`playwright-core` + a Chromium build are already installed, so a headless
screenshot pass costs a minute. **For clip work the review step is the pose
strip** (hold every authored beat, A/B against SPUM on the real character —
see Phase 6c); the first clip library shipped broken because that step was
skipped.

**Read next:** §2 locked decisions, then §3 measured rig facts (they explain
most of the non-obvious code), then the phase you're working on.

---

## 1. Goal

Build one original **base model** — a single canonical set of sprite dimensions
plus the art drawn to them — in a dedicated editor that shares the SPUM
**renderer and rig plumbing** but **none** of its catalog, art, or save path.
Then assemble named **characters** from it.

**Why a separate screen rather than extending Part Studio:** Part Studio
registers every part into `lib/spum/catalog.ts` and copies the stock template's
atlas geometry verbatim. Both are load-bearing for the SPUM pipeline and both
are exactly what this model needs to break. Forking the screen is cheaper and
safer than parameterising the existing one.

### Model vs. character

The two were originally conflated in one document. They are different things:

| | **Model** (one per project) | **Character** (many) |
|---|---|---|
| Owns | canonical geometry, the parts library, the base build | part picks, proportion deltas, a name |
| Authored by | Body + Slots tabs (Phases 3–4) | Characters tab (Phase 5) |
| Costs | drawing | nothing |

The distinction that makes this work is that "geometry" means two different
things, and they behave oppositely:

| | Changing it | Lives on |
|---|---|---|
| **Region sizes** (a sprite's pixel rect) | needs new art | the **part** (already in its atlas) |
| **Bone proportions** (`defaultPos`) | rearranges existing art for free | the **model** (base build) + **character** (delta) |

So several characters share every sprite and still read as different builds:
raise `BodySet` and `HeadSet` and you get a taller, longer-legged version of
the same guy for free.

### Non-goals

- Changing anything under `public/spum/`, `lib/spum/catalog.ts`, or
  `src/screens/admin-spum/`. The only permitted change to `lib/spum/` is
  additive, opt-in props on `SpumCharacter` (Phase 1).
- A new skeleton. See D2.
- **Multiple torsos.** There is exactly one body geometry (D11). It will be
  explored and changed repeatedly before it's settled, which is a different
  requirement from supporting several at once — see I3.
- Animation authoring until the model settles — proportions change how every
  clip reads, so re-authoring first would be wasted. That is Phase 6.

---

## 2. Locked decisions

| # | Decision | Rationale |
|---|---|---|
| **D1** | New route `/admin/aachar`, new dir `src/screens/admin-aachar/`, new lib `lib/aachar/`, new assets `public/aachar/`. No imports from `admin-spum/`. | Isolation by construction. `/admin/*` is already dev-only (`devOnlyRoutes` in `src/router.tsx`), so nothing ships to prod. |
| **D2** | **Reuse SPUM's bone paths**, as a trimmed subset. No new skeleton. | Verified: the renderer iterates `skeleton.bones` and looks up `clip.tracks[bone.path]`, so bones absent from the skeleton are ignored and clip tracks with no matching bone are ignored. A subset plays all 38 existing clips, and SpumScene / anchors / props / bubbles / camera / particles / destruct / all existing content keep working untouched. A genuinely new skeleton taxes every one of those for no artistic gain — the hierarchy is plumbing, not style. |
| **D3** | Proportions live in `defaultPos` overrides on the **never-animated** bones. | Clips write *absolute* local positions (`track?.pos ? samplePos(...) : bone.defaultPos`), so editing an animated bone's default is a no-op. See §3. |
| **D4** | Slots: `body`, `cloth`, `hair`, `eye`, `faceHair`, `helmet`, `weapon`, `weapon2`. **No `pant`, no `armor`, no `back`.** | User scope. Dropped slots' bones stay in the skeleton — they cost nothing and nothing renders on them. `weapon2` (the left hand, labelled "item L") was originally dropped and un-dropped in Phase 8b once held items proved out: the renderer already routed its `Weapon` region to `L_Weapon` (z 19, just behind the front left arm), so re-adding it was table entries only. |
| **D14** | The manifest is **autosaved** on any project change (debounced ~1s), the editor **reads it back** when it boots with no parts, and the `save-project` endpoint **refuses** to replace a populated manifest with an empty one. | D5 made the manifest the durable copy but left writing it to a button and reading it to nobody, so the real durable state was the localStorage draft — and losing that draft read as losing the project even with every PNG on disk (I11). Autosave closes the write gap, boot-read closes the read gap, and the endpoint guard closes the "a client bug can still destroy it" gap. |
| **D5** | Part registration via a runtime-fetched `public/aachar/manifest.json`. **Never** write into the module graph. | Root cause of the Part Studio save pain: it writes `lib/spum/catalog.ts`, which is imported, so every save triggers a full Vite reload and the draft only survives via localStorage. Writing solely to `public/` avoids the reload entirely. |
| **D6** | Explicit JSON export/import of the whole **project** (model + characters). | User requirement, and it makes the pipeline portable + backup-able independent of the dev server. A character alone exports to nothing useful — it's only picks and numbers without the model's art. |
| **D7** | Onion skin composites **pivot-to-pivot per region**, never sheet-to-sheet. | The new model is a different size than SPUM's, so a sheet-sized 1:1 draw (what Part Studio does) will not line up. `buildHeadOnion` already proves the pivot-alignment approach works. |
| **D8** | Namespace prefix `AA_` for part names. | Cannot collide with Part Studio's shared `Custom_` prefix. |
| **D9** | The editor renders through `atlasOverrides` with an **empty `config`**, not `resolvePart`. | A slot absent from `config` issues no fetch, so an empty config routes everything through the override map — and it incidentally disables three pieces of catalog-coupled behaviour the AA path doesn't want (I5): the hair mask (`resolveHideHair` reads `config.helmet`), shield routing (`isShieldPart` reads `config.weapon`), and the `Eye_Close.png` sibling fetch (gated on `config.eye`). All three degrade to "off", which is correct here. The `AA_RENDER_CONFIG` cast is load-bearing, not laziness. |
| **D10** | **Model / character split.** Art is filed by **slot** (`public/aachar/parts/<slot>/AA_<name>.png`), never by character name. | Art belongs to the base model and is shared by every character that picks it. Scoping the directory by character would mean copying PNGs sideways the moment a second character existed. |
| **D11** | **One canonical geometry**, expected to change during exploration and then settle. No multi-torso support. | User scope: one torso, not yet finalised. This removes the "which body was this cloth drawn for" problem entirely — cloth derives from *the* geometry — and replaces it with staleness detection (I3). |
| **D12** | Base proportions live on the **model**; characters store a per-bone **delta**. | Head attach point, shoulder height and neck length belong with the sprites drawn to sit at them. Tuning the base then moves every character that hasn't explicitly overridden that bone. |
| **D13** | **Per-character colour and appearance are a PER-PIXEL pass on the part's own PNG**, not a tint or a CSS filter. A part declares `colorChannels` (sets of its own authored hexes) and `protect` (what may never be touched); a character picks a target per channel plus hue/saturation/brightness/contrast per slot; the result reaches the renderer as an atlas whose `image` is a rewritten data URL. | Both alternatives already in the codebase fail the same way: SPUM's `feColorMatrix` tint multiplies the whole slice (darkens the outline, one colour per slice, so no two-colour shirt), and its `appearancePerSlot` CSS filter likewise hue-rotates the outline with the fill. A pixel pass can **skip colours**, which is what makes outline protection possible at all; it keeps the ramp's shading (OKLab offsets, Phase 5e), needs **no renderer change**, and is invisible to pivots, the gutter and the hair mask because only pixel values move. |

---

## 3. Measured rig facts this plan depends on

Established by direct measurement of `public/spum/anims/*.json` (38 clips) and
`public/spum/skeleton.json` (71 bones). Recorded here so future sessions don't
re-derive them.

**Clips override `defaultPos` absolutely.** [`SpumCharacter.tsx:973`](../lib/spum/SpumCharacter.tsx#L973):

```js
track?.pos ? samplePos(track.pos, t) : bone.defaultPos
```

Any bone with a `pos` track ignores its skeleton default. Bones animated by
clips — **do not expect `defaultPos` edits to do anything here**:

`Root` · `P_Body` · `P_Back` · `P_Head` · `P_LArm` · `P_RArm` · `P_LFoot` ·
`P_RFoot` (`HeadSet` has rot tracks in 18 clips but **pos in 0**, so its
position default *is* live).

**The proportion knobs — never animated by any of the 38 clips, safe to move:**

| Bone | default (units) | px @32/unit | Controls |
|---|---|---|---|
| `Root/BodySet` | y 0.25 | 8 | height of torso+head above the feet |
| `…/P_Body/HeadSet` | (0.03125, 0.140625) | (1, 4.5) | head attachment point on the torso |
| `…/P_Head/P_Head` | y 0.1875 | 6 | head sprite offset from its pivot ("neck") |
| `…/P_Body/ArmSet` | y 0.09375 | 3 | shoulder height |
| `…/P_Body/Body` | y −0.015625 | −0.5 | body sprite offset |
| `…/P_Head/P_Eye` | y 0.078125 | 2.5 | eye position within the head |
| `Root/P_LFoot/_3L_Foot` | y −0.0625 | −2 | foot sprite offset below its pivot |

**Region size is free.** [`SpumCharacter.tsx:1100`](../lib/spum/SpumCharacter.tsx#L1100)
places slices as `originX = pivotX*width`, `originY = (1-pivotY)*height`, then
applies the bone's world transform. The slice is pinned by its *pivot fraction*;
size never enters the bone math. Resizing a region has **zero** animation impact.

**The PNG path comes from the atlas.** Slices are pushed with `atlas.image`
([`SpumCharacter.tsx:868`](../lib/spum/SpumCharacter.tsx#L868)), which each
`.atlas.json` carries itself. So the Phase-1 seam only needs to resolve the
**atlas URL** — the PNG follows automatically.

**Stock geometry for reference** (`body/Human_3`, sheet 21×31): Head 17×15,
Body 12×10, Arm_L/R 6×7, Foot_L/R 4×7. The head is larger than the torso.

---

## 4. Phases

### Phase 1 — `resolvePart` + `skeletonOverride` seams 🟢

**Done (2026-07-28).** `SpumCharacter` resolved art through `atlasPath()` →
`SPUM_SPRITES[slot][part]`, a hard-wired table; without a seam, rendering an AA
character would require registering it in `lib/spum/catalog.ts` — the exact
entanglement this plan exists to avoid. Two optional props added, mirroring the
existing `clipOverride` / `atlasOverrides` pattern:

```ts
resolvePart?: (slot: string, part: string) => string;  // → .atlas.json URL
skeletonOverride?: Skeleton;
```

Every existing consumer omits both and behaves identically. `tsc` clean, 1071
pre-existing tests still pass, no visual change at `/admin/spum`.

⚠️ `skeletonOverride` is exercised by the AA editor. **`resolvePart` is not yet
exercised by any consumer** — the editor supplies atlases in memory via
`atlasOverrides` instead (D9). Kept as the documented seam for a future
consumer needing fetch-by-name rather than a fully-loaded manifest; treat it as
untested-in-anger until something calls it.

---

### Phase 2 — Project document, manifest, route, export/import 🟢

**Done (2026-07-28), revised the same day for the model/character split (D10).**

```
lib/aachar/types.ts        AaModel · AaCharacter · AaProject · AaPart · AaGeometry
lib/aachar/geometry.ts     sheet packing, atlas derivation, geometryEquals
lib/aachar/skeleton.ts     proportion knobs, animated-bone guard, composeSkeleton
lib/aachar/character.ts    construction, lookup, staleness, validation, upserts
lib/aachar/render.ts       picks → atlasOverrides projection
lib/aachar/export.ts       .aachar.json bundle (PNGs inlined)
lib/aachar/placeholder.ts  procedural mannequin from geometry
scripts/vite-aachar-plugin.ts   save-part (by slot) + save-project
src/screens/admin-aachar/  editor shell
```

Verified against a running dev server: the screen module transforms, the save
endpoint writes `public/aachar/manifest.json`, path-traversal names are
rejected, and **no HMR or reload fires on save** — the property the whole
design hangs on.

---

### Phase 3 — Body editor 🟢

**Done (2026-07-28).** `src/screens/admin-aachar/BodyEditor.tsx`, plus
`lib/aachar/pixels.ts` (buffer ops, bounded flood fill, pivot-aligned
migration) and `lib/aachar/onion.ts` (pivot-to-pivot compositing).

The one thing Part Studio structurally cannot do:
[`PartStudio.tsx:823`](../src/screens/admin-spum/PartStudio.tsx#L823) only
records resizable geometry for single-region parts (`regionNames.length === 1`),
so `body` (6 regions) has no resize path there. Here the four measurements
drive a re-packed sheet.

Shipped:
- Canvas editor: pencil / eraser / fill / pick / **rect / ellipse / circle**,
  zoom 4–28×, undo/redo (Ctrl+Z / Ctrl+Y), 18-colour palette + picker,
  checkerboard for transparency
- Shape tools drag to size with a live preview of exactly which pixels will
  land, filled or 1px outline, clipped to the region the drag STARTED in
- Select: marquee a box, drag inside it to move, arrow keys to nudge 1px, and
  drag the **rotation handle** off its edge to turn it (Shift snaps to 15°,
  `[` / `]` step it). Moves and turns stay inside the region the box was made in
- **Editable region rects** — resize Head/Body/Arm/Foot; the sheet re-packs and
  existing pixels migrate **pivot-aligned** (I3), so exploring proportions
  doesn't mean redrawing
- Region overlay with labels and pivot crosses; the selected region follows
  clicks
- Onion: any stock SPUM body, toggle + opacity, composited **pivot-to-pivot per
  region** (D7) so it lines up despite different sizes
- Live rig preview — in-progress pixels reach the animated character on every
  stroke, before any save
- Save writes `public/aachar/parts/body/`, adds the part to the model library,
  and stamps `authoredFor`

Verified against a running dev server: modules transform, the SPUM onion source
loads, a real 21×31 PNG round-trips through `save-part`, an out-of-bounds
region is rejected, the written atlas carries the canonical image path, the
files serve back over HTTP, and **no reload fires**. 17 new pixel tests.

Two behaviours worth knowing:
- **Flood fill is clipped to the region you click in.** The packer leaves no
  gutter (Body at x=0 and Arm_R at x=body.width are adjacent), so an unbounded
  fill would leak into a neighbouring sprite. Covered by a test.
- **Undo across a geometry change is refused, not applied.** The snapshot is
  sized to the old sheet; restoring it would corrupt the canvas. The editor
  says so rather than failing silently.

⚠️ **No `pant` means the body's own `Foot_L`/`Foot_R` regions are always
visible** (I2). They must be drawn as finished legs/shoes, not the bare stubs
`Human_3` ships. The editor shows this warning inline.

**Acceptance met:** draw a body with a smaller head and a taller torso, save,
see it render on the rig playing `idle`.

---

### Phase 4 — Remaining slots 🟢

**Done (2026-07-28).** Brought forward so eyes could be drawn while the torso
proportions are still being judged — a head reads completely differently once
it has a face.

`src/screens/admin-aachar/PartCanvas.tsx` (the canvas extracted out of
BodyEditor and shared by both tabs), `SlotEditor.tsx`, `lib/aachar/slots.ts`.

Every non-body slot falls into one of three shapes:

| Shape | Slots | Sheet |
|---|---|---|
| **derived** | `cloth` | sized from model geometry — sleeves can't drift from the torso |
| **free eye** | `eye` | SPUM's two-band free layer: one stamp, both eyes hand-placed |
| **single** | `hair`, `faceHair`, `helmet`, `weapon` | one region, free size |

- The onion is **your own body**, not a SPUM part. Region names never coincide
  across slots (cloth's `Left` is the body's `Arm_L`; an eye sheet shares
  nothing with `Head`), so `compositeOnion` gained an explicit region **mapping**
  with a per-region offset.
- **The free-eye onion offset is derived from the live skeleton**, not
  hardcoded. The head sprite sits `(P_Head.y − P_Eye.y − PivotFront.y) × 32`
  above the eye anchor — 2.5px at stock — and those are exactly the bones the
  AA model overrides, so a constant would drift the moment proportions are
  tuned.
- Multiple parts per slot are supported; the slot picker marks which have art.
- `PartCanvas` is remounted per slot (`key={slot}`) — the buffer, undo stack
  and hydration guard are all per-part.

**Acceptance met:** a fully dressed original character renders on the rig.

---

### Phase 5 — Characters tab 🟢

**Done (2026-07-28).** `src/screens/admin-aachar/CharactersTab.tsx`, plus
per-part editing in the Slots tab.

**A — Part library management.** The editor previously resolved
`partsInSlot(model, slot)[0]`, so only the FIRST part in a slot was reachable:
a second hair could never be opened, and saving under its name from a blank
canvas would have wiped it — the same shape as the tab-switch data loss. Now:

- A picker lists every part in the slot, plus **+ New**
- Selecting one hydrates it, and **adopts its own canvas size** — otherwise a
  part drawn at 48×36 would be migrated down to whatever the slot control last
  said and silently shrunk on save
- `suggestPartName` proposes an unused name (`hair` → `hair2`) so a new part
  can't clobber a sibling
- Delete (leaves the PNG on disk)
- `PartCanvas` remounts per **part**, not per slot — buffer, undo stack and
  hydration guard are all per-part

**B — Characters tab.** Add / delete characters; a part pick per slot with
"none" allowed; per-character proportion **deltas** over the model's base build
(D12), with own-vs-inherited marked and a per-bone reset. New characters are
seeded with one of each available part so they render immediately rather than
as an invisible rig.

**Acceptance met:** two characters share every sprite, differ only in
proportions, and read as different builds.
- Show each value in both Unity units and source px
- ⚠️ Animated bones must be refused or visibly warned on — a slider that
  silently does nothing is the single most likely source of confusion here (I1)
- Preview while a clip plays, so proportion changes are judged in motion

**Acceptance:** two characters share every sprite, differ only in proportions,
and read as different builds.

---

### Phase 5b — Image import 🟢

**Done (2026-07-28).** `lib/aachar/importArt.ts`, exposed in `PartCanvas` as
"Import into <region>…" — so it works on every slot, not just helmet/weapon.

Imports into the **selected region**, because that's the unit that maps to a
sprite. Options: keep-matte, average/crisp sampling, palette cap.

**SVGs take a separate path, and that's the point.** The raster path
downsamples a bitmap that was already rasterised at some other size, so it
averages pixels whose anti-aliasing is already baked in — damage compounding on
damage. The vector path measures the SVG's content box once, then asks the
browser to rasterise **at sprite size** (4× supersampled for "average", 1:1 for
"crisp"), so every sprite pixel is a fresh decision made from the original
geometry. Rasters instead get matte removal → trim → box-downsample.

Either way the art is **letterboxed** into the region, keeping its proportions
rather than stretching, and **replaces** the region rather than compositing —
an import means "this region is now that picture".

Reuses `lib/spum/imageOps.ts` (pure image maths, already tested) on the same
grounds as `shapes.ts`; the browser glue is written locally because the Part
Studio's copy lives in `src/screens/admin-spum/`, which `lib/aachar/` may not
import from.

⚠️ `importArt` needs canvas + File, so only `isSvgFile` and `fitInside` are
unit-tested. Verify imports in the browser.

---

### Phase 5c — Headroom + live import transform 🟢

**Done (2026-07-28).** Two playtest asks from authoring face art: *"way more
space above the head, so I can put it higher up"* and *"resize an imported
image"*.

**Headroom** (`clampHeadroom` / `headroomPivot` / `headroomFromPivot` in
`lib/aachar/slots.ts`, control in the Slots tab). Hair, faceHair and helmet pin
to the same anchor the head sprite does, so with the stock centre pivot the
canvas is *centred on the head*: half of any height you add lands under the
chin, where nothing is ever drawn. Headroom slides the anchor **down its own
canvas**, so the rows it frees appear above the head — and because
`compositeOnion` aligns on the pivot, the onion head visibly drops with it.
`+8 above` grows height by 8 and the anchor by 4, which is the arithmetic that
leaves the room below untouched (`room above = height/2 + headroom`);
**Room for tall hair** (`roomyCanvas`) jumps straight to 20px over the head's
top edge and 4px under its bottom, derived from the model's own head so it
tracks the geometry. Saved on the part's atlas pivot and adopted back when it's
reopened; absent means centre, so every earlier part is unaffected.

⚠️ **Defaults, not just the control, were the problem.** The first cut shipped
the headroom slider on top of the old `DEFAULT_SINGLE_SIZE` — hair 25×20 on a
10px head, i.e. 5px for a hairstyle to grow into — so a new hair part looked
exactly as cramped as before and the fix read as absent. New defaults (hair
28×34 + 8, helmet 32×38 + 10, `DEFAULT_HEADROOM`) start head-worn slots with
real room above the head. A part already saved keeps its own canvas, by design:
reopening it adopts its size and pivot, so it takes one button to grow.

**Live import transform.** An import now lands as a **floating draft** —
scale slider (10–400% of the region), drag on the canvas, arrow-key nudge,
Enter to place, Esc to drop — instead of being letterboxed into the region and
committed on arrival. "Letterboxed to fill the region" is only ever right for
art drawn to that exact box; anything else needs to be smaller and sat
somewhere specific. `importArt` split into `prepareArt` (decode once) +
`render(w, h)` so every scale tick **re-renders from the decoded original**
rather than resampling a previous render — quality is identical at any size,
and a slider drag doesn't re-decode the file sixty times a second. "Clear the
region first" (default on) preserves the old replace-don't-composite rule.

`migratePixels` gained a separate `toPivots`, so an anchor that MOVES still
migrates art anchor-to-anchor — otherwise every part already drawn would slide
up the skull the moment headroom was added.

---

### Phase 5d — Hair under a helmet + a palette that keeps the red 🟢

**Done (2026-07-28).**

> ⚠️ **The hair-mask half of this phase is SUPERSEDED (2026-07-30, Phase 5f).**
> The always-on mask never looked right in practice; it is now a per-character
> **choice of hat-hair mode**, baked into the hair atlas's pixels instead of a
> renderer clip-path (`lib/aachar/mask.ts` and `SpumCharacter.hairCropProfile`
> are gone). The per-column bottom-edge GEOMETRY below still holds — it lives
> on as the `tuckHat` mode's rule and every other mode's foundation
> (`lib/aachar/hatHair.ts`). The palette half of this phase is untouched.

**Hair mask.** Nothing clips a slice to the skull — that's what lets hair
overhang — so hair worn under a helmet escapes it. SPUM's `resolveHideHair`
deletes hair outright when a helmet is on; AA needs a **mask**, because hair
should still show below the brim. `lib/aachar/mask.ts` computes it and
`SpumCharacter` gained an opt-in `hairCropProfile` prop that clips the hair
slices with a staircase `clip-path: polygon(...)` in their own source-pixel box
(no profile → the rendered DOM is byte-identical to before, and the SPUM
pipeline never sets it).

**It is PER-COLUMN, and that is the whole point.** The first cut of this used a
single cut line and shipped visibly broken: a sun hat's crown is high in the
middle and its brim is low at the sides, so hair that clears the crown still
pokes out at the hat's shoulders while a horizontal cut computes to *zero rows*.
Measured against the real parts (`AA_hair` 25×20, `AA_sunhat` 32×38):

```
sunhat profile   38 38 38 38 38 38 25 24 24 23 … 18 18 18 … 23 24 24 25 38 38 38 38
hair mask        0 0 7 6 6 5 5 5 2 1 1 0 0 0 0 1 1 2 5 5 5 6 6 7 0
```

— nothing at the outer columns the hat doesn't cover, nothing under the crown,
deepening towards the shoulders. The maths, per column:

```
hair top  = (hairAnchor − helmetAnchor) + (1 − pivotY_hair)×height_hair
crown[j]  = (1 − pivotY_helmet)×height_helmet − profile_helmet[j]
crop[i]   = max over the helmet columns j that hair column i overlaps
            of (hair top − crown[j])
            j = i − pivotX_hair×W_hair + pivotX_helmet×W_helmet
```

The **union**, not one rounded column: 25-wide hair under a 32-wide hat offsets
by 3.5px, so each hair column straddles two helmet columns. Rounding to one of
them leaks on the hat's steep left slope — the column further up the dome has a
crown several px higher than the hair actually meets, so nothing there gets cut
and a few pixels of hair survive at the top-left. Found in playtest, twice.

⚠️ `(1 − pivot.y)`, not `pivot.y` — the pivot is measured from the region's
BOTTOM. Inverting it reads a canvas with 8px of room above the head as having
8px below it, which is exactly how the broken version computed no mask.

**The onion was lying, and that was the real "hat floats" bug.** SPUM hangs
each head-worn sprite from its OWN bone, all siblings under `P_Head`:

| slot | bone offset from `P_Head` | vs the head sprite |
|---|---|---|
| head sprite | (0, 6px) | — |
| hair | (0, 9.5px) | 3.5px above |
| helmet | (0, 8.5px) | 2.5px above |
| faceHair | (−1.5px, 1px) | 5px below, 1.5px across |

`onionMappingFor` drew the reference head at the slot's own anchor, so it was
2.5–5px out in every head-worn slot and art lined up against it rendered that
far off — a hat drawn to sit on the reference floats above the real head.
`headOffsetFromSlotAnchorPx` now derives the correction from the live skeleton,
the same way the eye bands always did. ⚠️ Head-worn art authored before this
was aimed at a reference that was in the wrong place; re-check hair, helmet and
faceHair against the corrected onion.

Second placement bug fixed alongside: a floating import centred itself on the
region RECT, which after headroom is nowhere near the anchor — so an imported
hat landed ~10px above the head it was meant to sit on. It now centres on the
anchor.

`contentProfile` is new on `AaPart`: the sprite's top profile per column,
written on save and **only for the helmet slot** (the only thing that masks).
Without it the mask would work off the helmet **canvas** top, which after
Phase 5c is mostly empty air. A helmet saved before this carries none, so the
editor measures the PNG instead — no re-save needed.

Consequence worth knowing: a helmet drawn LOW (a headband) masks everything
above it, per column. The rule is "no hair above the helmet's outline", and
where that outline falls is the art's decision.

**Correction (2026-07-29, the jester hat): mask to the BOTTOM edge, not the
top profile.** The top-profile mask models the hat as solid beneath its
outline. The sunhat is; the jester hat is not — its prongs droop outward with
air UNDERNEATH, so hair in the notch below a prong sits under the hat's
topmost pixel (mask computes ≤ 0 rows, correctly by its own rule) yet reads as
outside the hat. The cut is now at the helmet's **bottom edge** per column:

```
hem[j]   = (1 − pivotY_helmet)×height_helmet − bottom_helmet[j]
crop[i]  = max over straddled j of (hair top − hem[j])
```

where `bottom_helmet[j]` is one past the column's lowest opaque pixel (0 =
empty column, which still means "not covered, leave the hair alone"). Safe
because the helmet sorts over hair (z 11/12 vs 6): everything between a
column's top and bottom edge is either behind opaque hat pixels or in a notch
that should be cleared; everything below the hem — brim, ears, neck — still
shows, and a hat floating wholly above the hair now correctly masks nothing.
`AaPart.contentBottomProfile` supersedes `contentProfile` (legacy, no longer
written or read); old helmets fall back to `measureBottomProfile` on the PNG,
so no re-save is needed. The headband consequence above still holds — slightly
deeper, to the band's underside.

**Quantizer.** `quantize` gained a `QuantizeMode`. Median cut (`coverage`,
still the default for `lib/spum`) splits at the median PIXEL, so palette slots
follow area: a 40-shade brown ramp takes three of four slots and a six-pixel red
highlight is averaged away into a red-brown. `distinct` seeds by
**farthest-point** over the colour bins (rare colours can be seeds; only the
dominant colour is guaranteed one), then runs weighted Lloyd — so black, yellow,
brown and red survive four slots and the browns collapse to one. Distance is
redmean-weighted, not raw RGB, which is what keeps dark brown and dark red apart.
AA's import defaults to `distinct`; the floating draft now shows the palette it
actually produced as clickable swatches.

---

### Phase 5e — Per-character colours and appearance 🟢

**Done (2026-07-28).** A character can recolour named parts of the art it wears
— a hairstyle's interior, one or two colours of a shirt — and separately push
**hue / saturation / brightness / contrast** per part. Both leave the outline
and everything untagged exactly as drawn.

```
lib/aachar/recolor.ts       OKLab ramp maths, appearance, protection, the pass
lib/aachar/recolorAtlas.ts  decode → transform → data URL, two caches
src/screens/admin-aachar/ColorChannels.tsx        tagging + protection panel
src/screens/admin-aachar/useRecoloredOverrides.ts picks + look → overrides
```

**The art is drawn in real colours and then TAGGED.** Nothing is painted a
sentinel white or magenta. An `AaColorChannel` is a set of the part's own
palette entries (`{id, label?, base, ramp[]}`) that move together; a character
stores `colors[slot][channelId] = hex`, and an absent entry means the authored
colour. A cloth that only ever needs one colour changed declares one channel;
two is the shape a shirt-plus-trim wants. Because tagging is palette-keyed
rather than region-keyed, one tag covers cloth's `Body`, `Left` and `Right` at
once.

**No renderer change was needed.** A slice takes its PNG from `atlas.image`
(§3), and the AA path already supplies atlases in memory, so an adjusted
character is just an atlas whose `image` is a rewritten data URL. Pivots, the
gutter, the hair mask and `contentProfile` are all untouched — only pixel
VALUES change. `hairMaskProfile` deliberately reads the RAW atlas: the mask is a
statement about alpha, and keying it on the adjusted data URL would re-decode
the helmet on every slider tick.

**Why not the two obvious answers.** SPUM's per-slot tint (`config.colors` →
`feColorMatrix`) is a MULTIPLY over the whole slice: it darkens the outline
along with the target and cannot give two independent colours inside one
sprite. Flat-white keying works but loses the ramp — three browns come back as
one tone.

**Appearance is the same pass, not a CSS filter** — and that is the whole
reason it isn't. `lib/spum` does hue/saturation/brightness/contrast as
`appearancePerSlot` → a CSS `filter` chain, which is far cheaper but applies to
the entire slice: the black outline gets hue-rotated with the fill. A per-pixel
pass can skip colours, so `AaPart.protect` names what a character may never
touch and BOTH halves honour it. Applied in OKLCh in the order brightness →
contrast → saturation → hue, matching how the four read as a CSS filter list.

⚠️ **Contrast pivots at 0.5998, not 0.5** — that is OKLab's lightness for sRGB
mid-grey. Pivoting at 0.5 makes `contrast > 1` visibly *darken* the midtones,
which is the opposite of what the word means. Pinned by a test.

**Protection defaults to a lightness threshold, not a tagged list**
(`DEFAULT_PROTECT_LIGHTNESS` = 0.30), because "the sliders wrecked my outline"
has to be wrong out of the box rather than after setup. It is deliberately
tight — the palette's outline `#1a1c2c` sits at L 0.234 while `#333c57` and a
dark brown `#5c3a1a` are 0.36 and 0.38, so it catches near-black and nothing
that's doing artistic work. The Slots panel shows which colours it caught, with
a slider and click-to-pin for the rest, so an over-eager threshold is visible
instead of being discovered on the rig. Measured on the AUTHORED colour: a shade
that merely *becomes* dark after a hue shift is not retroactively spared.

**The maths is OKLab, not RGB** (`shiftColor`). Each tagged shade keeps its
*lightness offset* from the base, its *chroma ratio*, and its *hue shift*; the
base lands on the target exactly. That is what carries hand-drawn shading
across a hue change — the same numeric step in RGB is a big jump in blue and
invisible in green, so an RGB remap comes out muddy at one end and blown out at
the other. A grey ramp (zero base chroma) has no ratio to keep, so every entry
simply takes the target's chroma, which is the right answer for greys drawn as
a deliberate placeholder.

⚠️ **A near-black tagged into a coloured ramp stays near-black**, because the
lightness offset is preserved. That is correct, and it is also the argument for
leaving outlines untagged rather than tagging them and hoping.

Authoring: a `tag` tool (click a pixel to add/remove its colour — never touches
pixels, so no undo step) plus a swatch list of the canvas's own palette, with
double-click to sweep in near-duplicates (OKLab ε = 0.05) for imported art. The
panel shows the authored ramp beside its recoloured preview under a test
colour, flags a channel matching **0px** (re-shaded since tagging), and flags a
hex claimed by two channels.

Picking happens in the Characters tab: a colour row per channel the worn parts
declare, and an Appearance panel with a slot picker plus four sliders. An
absent colour pick and an identity appearance are both deleted rather than
stored, so "adjusted" stays a meaningful mark and an untouched character carries
no block at all.

⚠️ **Two caches, both keyed on the image URL**, and an overwrite keeps the same
canonical URL — so `PartCanvas` calls `clearRecolorCache()` on save. The second
cache holds DECODED buffers: without it a slider drag would re-decode the same
PNG through an `<img>` on every tick, which is the expensive half by an order of
magnitude.

Verified in a real browser (headless Chromium, seeded from the live manifest, no
disk write), by reading the rendered slice's own pixels rather than the DOM:

- **Colour** — before a pick every slice serves from `/aachar/...`; after one,
  exactly one slice (the hair) is a data URL, and the rig shows green hair
  turned blue with its outline intact.
- **Appearance on an UNTAGGED part** — hue +140 and saturation 1.6 moved the
  hair's `#a7f070` (100px) to `#a2bdff`, while `#1a1c2c` stayed at exactly 49px.
  That count is the assertion: the outline is bit-identical through the
  transform.

47 recolour tests, full suite 1341 green, tsc + lint clean.

---

### Phase 5f — Hat-hair modes (replaces the always-on mask) 🟢

**Done (2026-07-30).** The Phase 5d hair mask is gone as a strategy: it never
looked right on real characters, and "what hair does under a hat" turned out
to be an artistic CHOICE, not a rule. A character now picks a **hat-hair
mode** in the Characters tab (`AaCharacter.hatHair`, absent = `"none"`),
applied only when the character wears both hair and a hat:

| mode | what it does |
|---|---|
| `none` | hair exactly as drawn; the hat just sits on it (the default) |
| `tuckHat` | cut hair above the hat's bottom edge, per column, only where the hat has pixels — the old mask's rule; side wings survive |
| `tuckHem` | `tuckHat` plus the hem extends sideways past the hat's edges, so hair wider than the hat is cut at the nearest edge's height |
| `tuckLine` | one straight cut across the full hair width at the hat's single lowest opaque pixel |
| `spill` | `tuckHem`, then where cut hair pokes past the hat's sides the edge is raised 1px in the hair's own fill colour and wrapped in a 1px line-colour outline — hair squeezed out around the brim |
| `spillShadow` | `spill` plus the first hair row under the hem darkens (×0.6) — a brim shadow |
| `spillTall` | `spillShadow` with a 2px puff |
| `spillWild` | `spillShadow` with a deterministic 1–3px puff varying in 2px-wide chunks — an unruly tuft |
| `spillSlope` | `spillShadow` with the puff tallest against the hat's side (3px) and tapering outward — hair pushed up by the brim |
| `squash` | nothing is deleted: each cut column is vertically compressed (nearest-neighbour) into the band below the hem — hat-hair |

**Every mode also GROWS (2026-07-30, same day).** Nudging the hat up
(placement dy) opened a strip of air: the cut rises with the hem, but hair
only reaches as far as it was drawn. So the plan now carries the RAW hem row
per column — unclamped, negative when the hem is above the hair's canvas — and
every mode starts with a grow pass: under-hat columns whose hair stops short
of the hem are vertically STRETCHED up to it (the exact inverse of squash's
resample; a hem above the canvas grows to row 0, the most the sprite can
offer). Only under the hat — growing the extended hem's side columns would
raise towers of hair beside a lifted hat. The hem row also switched from
`Math.round` to `Math.floor`: hair meets the hat from below, so a fractional
placement's half-pixel error must land on the overlap side (hidden behind the
hat), never as a visible seam of air.

```
lib/aachar/hatHair.ts        modes, per-column plan (crop + underHat), pure
                             pixel passes — replaces mask.ts
lib/aachar/hatHairAtlas.ts   decode → apply → data URL, cached; identity
                             result = "nothing to bake" (recolorAtlas contract)
src/screens/admin-aachar/useHatHairedOverrides.ts  hook after the recolour hook
```

**Baked pixels, not a clip.** The spill modes ADD pixels, which a `clip-path`
cannot, so the whole feature moved to the same trick the recolour pass uses:
rewrite the hair atlas's `image` as a data URL. `SpumCharacter.hairCropProfile`
and its staircase-polygon clip are deleted — the SPUM renderer knows nothing
about hat-hair anymore, and SPUM's own rigs render byte-identically by
construction rather than by an opt-in prop staying unset.

**Order matters:** the bake runs AFTER the recolour, because spill samples
"the colour of the chosen hair" — per column, the first surviving pixel below
the hem that isn't the hair's line colour (its darkest opaque colour), so the
puff reads as hair, not as more outline. The helmet contributes only ALPHA
(its bottom profile + region geometry), so it comes from the RAW helmet atlas
and a helmet recolour never re-bakes.

The plan folds in the character's hair/hat placement **dx/dy** (the old mask
ignored placement entirely); rot/flip are still unmodelled — a tilted hat cuts
as if straight. `hatHair` rides on outfits like the rest of the look
(capture/apply/`wearsOutfit`), validates in the shared look block, and
survives Randomize. The old geometry, its density handling, and its fixtures
carried over into `hatHair.test.ts` unchanged in spirit (`tuckHat` asserts the
exact old numbers); the pixel passes are pure and tested without a canvas.

---

### Phase 6 — Animation 🟢

**Done (2026-07-28; clips re-authored from scratch in Phase 6b/6c the next
day — see below).** Clips that do what the engine's do without being its data:
same durations (locked — scene content is timed against them), same bone paths
(plumbing, D2), and since 6c **provably not scaled copies of SPUM's motion**
(the originality gate, a real test).

⚠️ **The first clip library shipped by this phase was quietly a derivative
work AND read as broken on the real character.** Measured after the fact: 87%
of its beat frames sat on SPUM's pose keys, and per-channel correlation against
SPUM's curves was 1.00 on `damaged`/`attack_melee`/`throw` — the values were
SPUM's nudged 3–7%. It was authored by reading their pose sheets, which is
exactly the wrong method, and its "no shared keyframe values" test compared
strings, so `40.8 → 42.0` passed it. Meanwhile it looked wrong on screen
(crossed feet, flailing arms, the strike frame tipping the whole character
over) because it was tuned for SPUM's proportions, not this rig's. Phase 6b/6c
below is the fix; the format/compiler/editor from 6a survived unchanged.

```
lib/aachar/clip.ts          format, channel table, compiler, validation
lib/aachar/clipOps.ts       reverse / concat / hold / ramp / truncate / sample
lib/aachar/clipVariants.ts  the variant grammar + the review grid
lib/aachar/clipAnalysis.ts  structural analysis of ANY clip (theirs or ours)
lib/aachar/clipLibrary.ts   model override → library → SPUM fall-through
lib/aachar/clips/           the authored library (locomotion/social/action)
lib/aachar/preview.ts       fit a rig to its container
src/screens/admin-aachar/AnimationTab.tsx
```

**The format.** A clip is `{frames, loop, rest, beats[]}` where a beat is
`{frame, role, pose}` and a pose is a sparse map of seven channels to
`{rot°, x px, y px}`. That is the honest shape of what the engine actually
plays: pose sheets at shared timestamps, linearly interpolated, on the 60fps
integer grid. Curves or per-channel key times would be fictions the renderer
cannot express.

**Three layers, each a real knob.** `stance` (model-level neutral pose;
defaults to the rig's own `defaultPos` per channel bone) → `rest` (clip-wide
posture; `run`'s forward lean lives here, not repeated in five beats) → `beat`
(a DELTA from stance+rest). Deltas rather than absolutes is what makes
amplitude scaling, posture bias and L/R asymmetry arithmetic instead of a
rewrite.

⚠️ **The stance defaults to the rig's neutral for a load-bearing reason.** A
bone's `defaultPos` is what it falls back to when no clip positions it, so
every proportion control was tuned against those exact numbers. An invented
stance silently moves a character that was already dialled in — it opened a
0.5px gap at this character's neck and shifted its head 1.5px right on first
contact with real art. `fittedStance(geometry)` (wider feet for a wider torso)
is offered as a **button** in the Stance panel, never applied by default. The
panel also prints the live **neck seam** so the head/body junction is a number
rather than a squint.

**Seven channels** — root, torso, head, both arms, both feet. Chosen because
each maps to a sprite an AA character has, and because all seven are **disjoint
from every proportion bone**: a `pos` track kills a bone's `defaultPos` (§3,
I1), so a channel table that overlapped would silently disable the proportion
sliders. Module-load assertion plus a test. `P_Back` (no `back` slot),
`HeadSet` (a proportion bone), `Shadow` and the blink layer are all excluded —
the last two because the skeleton's defaults already equal what every SPUM clip
encodes there, so emitting them says nothing.

**42 clips authored** (2026-07-29 closed every clip reference in `content/`;
2026-07-30 closed the unreferenced engine tail, so every engine name now
resolves to AA motion):

| | |
|---|---|
| locomotion | `idle` `move` `run` `run2` (even-cadence pounding dash, forward press as root.x in rest) + `move_carry_loop` / `long_spear_walk` derived; `long_spear_idle`; `jump` (asymmetric-tuck apex) + `jump2` derived (1.25× flung variant) — `move_carry` (exact name only) is BANNED; the other carry variants stay |
| social | `greeting1` `greeting2` `greeting3` (a bow) `receive` + `give` / `givereceive` derived |
| action | `throw` `damaged` `attack_melee` `short_sword_attack` (flick-coil diagonal slash) `axe_attack` (ONE heavy overhand chop w/ buried hold — theirs is two) `skill_melee` (leaping two-fist slam, land-and-hit in one beat) `long_spear_attack` (translation thrust over `SPEAR_GUARD_REST`, chains with the spear idle) `debuff_stun` (three-corner drunken wobble, eyes at half) + AA-originals `stab` `uppercut` `yay` |
| cast (`clips/cast.ts`) | `skill_magic` (levitating cast) `attack_bow` `skill_bow` (high VOLLEY — held aim w/ tremor, vs attack_bow's flat shot) `buff` `concentrate` — `attack_magic` is BANNED (`BANNED_CLIPS`, 2026-07-29): never listed, never authored, resolves to `idle` |
| floor (`clips/floor.ts`) | `death_sleep` (backward faint w/ post-contact head bounce) + `getup` derived; `sleep_idle` `sit_idle` over shared poses; `sit` / `sleep` (deliberate transitions ending EXACTLY on `SIT_POSE` / `SLEEP_POSE`, so the idle chains without a pop); `death_sit` (seated collapse, stays seated where SPUM's lies down); `die` (fall_forward's face-plant phrase at the locked 40f, ends on `FACEPLANT_POSE`); AA-original `fall_forward` |

**AA-original names**: clips authored under names SPUM never had. No duration
lock, no SPUM fall-through, exempt from the originality gate (nothing exists
to trace); the editor's picker lists them and the reference view says so
instead of fetching a clip that doesn't exist. They only play where clips
resolve through the AA library — today the editor, after Phase 7 AA
characters in scenes. The first three were all born from failed throws,
named by playtest: `stab` (throw v1, read as a poke), `uppercut` (throw v2,
an underhand rise), `yay` (uppercut's symmetric variant — both arms up,
derived via `applyVariant` so it stays a function of `uppercut`).

The fall-through tail is CLOSED (2026-07-30): the 13 unreferenced engine
names were authored deliberately so no engine name plays SPUM's motion in
any circumstance. The fall-through mechanism in `clipLibrary.ts` survives
as the safety net for a clip name added to the engine later; the test that
asserted `jump` resolved to `"spum"` now asserts it with a hypothetical
future name instead. `clipCoverage()` still reports the state.

**Derived clips are functions, not copies.** `lib/spum/catalog.ts:706-742` warns
that regenerating a parent without its children desyncs them; here `give =
reverse(receive)`, `givereceive = give + receive` (seam deduped), `move_carry* =
hold/ramp(move)`, so the desync is structurally impossible.

**A — variant grid.** Four knobs, measured off what the engine's clips actually
vary: `amplitude` (deltas ×k), `posture` (added to rest), `asymmetry` (scales
each L/R pair's deviation from mirror symmetry), `beatBias` (re-times interior
beats along a power curve, then repairs back onto the integer grid). Eleven
tiles, one knob at a time — a grid that varies two at once tells you a tile is
wrong without telling you which knob did it. Every variant preserves duration,
beat count, endpoints and loop closure; `retimeBeats` **declines** rather than
collapsing two beats onto one frame.

**B — reference view.** SPUM clips shown as pose keys with a three-position
overlay (silhouette / keys / numbers) and a side-by-side A/B against the AA
clip. Off-grid keys are flagged in red — `receive` and `givereceive` are the
only two in the whole set, and the test asserts exactly that.

⚠️ **The preview scale was wrong everywhere and is fixed.** `size` on
`SpumCharacter` multiplies a base of 6.875 CSS px per source pixel, so the
`size={6}` default from Phase 3c rendered a 32px character ~1300px tall into a
420px box — a magnified fragment of a torso. Survivable while drawing pixels
(the canvas is the workspace there); fatal for judging motion. `fitSize` now
derives the multiplier from the model's own geometry and the slider is a **zoom
around that fit**.

#### Phase 6b — the rig study (`lib/aachar/rig.ts`) 🟢

**Done (2026-07-29).** Before re-authoring, the rig was measured EMPIRICALLY —
single-channel probe clips rendered through the real renderer, slice movement
read off `getBoundingClientRect`. The facts, all pinned by `rig.test.ts`:

**Screen semantics.** The character faces LEFT; the renderer maps Unity y-up
to CSS as `translate(x·u, −y·u) rotate(−rot.z)` chained root→leaf. So `+x` =
screen right = BEHIND, `−x` = forward, `+y` = up, `+rot` = CCW = a bone's top
tips forward; for a hanging limb, `−rot` swings the hand/toe FORWARD.

**Hierarchy that changes authoring.** Feet are children of ROOT, not the body
(a body lean doesn't carry them; a root rotation tips everything). The head
bone carries head + hair + eyes + faceHair + helmet. `Arm_L` draws in FRONT of
the torso (z+20), `Arm_R` BEHIND (−20).

**Levers and budgets (the saved character).** `channelLevers` measures each
channel's furthest painted art (pngjs alpha scan, not region rects);
`amplitudeBudget` inverts that into degrees per intensity:

| channel | lever | calm | active | violent |
|---|---|---|---|---|
| root / body / head | 22–34px (hair rides all three) | 3–4° | 7–10° | 15–23° |
| arms | ~9px | 9–10° | 24–27° | 56–64° |
| feet | 5.9px | 15° | 40° | 101° |

The first library's `attack_melee` spent root 34° + body 18° + head 49° —
roughly triple the violent ceiling on three stacked channels sharing the same
hair lever. That IS the falling-over frame.

**Silhouette.** `silhouetteChecks`: at stance the feet's painted art (reach
4–6px) never clears the torso half-width (8.5px) — **foot rotation is
invisible at stance**, so locomotion must be position-dominant.

**Foot coupling.** At a contact, a foot forward of its own hip carries
NEGATIVE rot and a trailing foot POSITIVE (signs match the Δx). Authoring rot
independently of x was the first library's broken-ankle defect; now a test.

#### Phase 6c — re-authoring + the originality gate 🟢

**Done (2026-07-29).** All 13 clips re-authored from the budgets above and the
grammar (beat roles, contralateral swing, anticipate/strike/settle), NOT from
SPUM's pose sheets. What changed in kind, not degree:

- **Locomotion is split-contact and position-dominant**: at a walk contact the
  feet are maximally split (~10px stride per foot), gathering under the body
  at the pass; only the swinging foot lifts, the planted one stays down and
  rolls. `run` is a deliberately lopsided 9/11-frame gait with reach-and-paw
  strides (the x-extremum at the PASS, where SPUM's is at the contact).
- **Impact is displacement, not rotation**: `attack_melee`'s lunge and
  `damaged`'s knockback are `root.x` shifts over a held foot stagger; the one
  deliberate hair-lever whip is `damaged`'s head (−18°, flying hat = the hit).
- **Beat structures are SPUM-disjoint**: every interior non-contact beat sits
  OFF SPUM's pose keys (gate-enforced; locked hand-offs exempt — `receive` f26,
  `throw` f17, `givereceive`'s f26 concat seam).

**The originality gate** (in `clip.test.ts`) makes the traced library
unrepresentable: per channel it samples the JOINT rot+x+y curve and fails if
it is ≈ a scalar multiple of SPUM's (residual < 0.3 after best-fit scale).
Rotation alone is too blunt — any walk's foot-rot is a triangle wave — but one
scalar cannot serve rot AND travel at once unless the rot:pos RATIOS were
copied, which is precisely what tracing does and independent authoring doesn't.
The traced library measured < 0.1 on ten channels; the re-authored one clears
0.3 everywhere.

**Every clip was then LOOKED AT** — a headless pose-strip harness holds each
authored beat side-by-side with SPUM's clip on the real character (scratchpad
`strips.js`). That review caught `move`'s first cut converging both feet at the
centre (crossed-X legs) — fixed to split contacts before anything shipped. The
skipped-look is how the first library's breakage went unnoticed; the strip
harness is now the review step for any clip work.

#### Measured facts about SPUM's clips

Established by direct measurement of all 38 files in `public/spum/anims/`.
Recorded here because they are the input to any re-authoring work, and
re-deriving them is an afternoon.

**The clips are pose sheets, not curves.** Taking the union of keyframe times
across animated channels, then asking how many channels key at every one:

```
idle         3 poses   4 chans   100% shared
damaged      4 poses   6 chans   100% shared
attack_melee 4 poses   8 chans    97% shared
greeting2    5 poses   4 chans   100% shared
```

⚠️ **The 90% figure above is optimistic** — it counts only the channels present
at every pose time, which selects for the answer. Re-measured in Phase 6 over
every animated bone (`analyzeClip`'s `sharedness`, which excludes single-key
constants like the four static eye-visibility tracks): **mean 0.75, median
0.74**. The conclusion is unchanged and the test pins it: a clip is **3–11
whole-body poses at shared timestamps**, linearly interpolated, with three
quarters of animated bones keyed at any given pose.

**Interpolation is linear.** [`curve.ts:23`](../lib/spum/curve.ts#L23) discards
the stored `inSlope`/`outSlope`. There is no easing in this engine — timing
feel is *only* beat-length ratios.

**Every duration is a round frame count at 60fps** (20/25/30/40/50/60). The
only off-grid keyframes in the whole set are in `receive`/`givereceive`, which
are hand-authored, not SPUM's.

**The beat structure is the animation.** `attack_melee`, 25f, poses at
f0/f10/f15/f25 — 10 frames anticipation, 5 frames strike (2× faster, every
sign flips), 10 frames recovery. `damaged` is 10:5:5 — recoil, overshoot *past*
rest, settle.

**Locomotion has hard structure.** Arms swing contralateral to their own leg;
body-Y bobs at **twice** the limb frequency; left and right are deliberately
*not* mirrored. `run` differs from `move` mainly by a constant +11.1° body lean
with −11.9° head counter-rotation.

**Amplitude budget** (peak-to-peak rot.z across all 38 clips):

| channel | clips w/ rot | max° | clips w/ pos |
|---|---|---|---|
| Body | 35 | 101 | 32 |
| LArm | 35 | 305 | 33 |
| RArm | 34 | 191 | 28 |
| Head | 38 | 64 | 33 |
| LFoot / RFoot | 26 | 90 / 94 | 21 / 26 |
| Root | 8 | 77 | 19 |
| Back | 9 | 52 | 10 |
| **HeadSet** | **0** | **0** | **0** |

`idle` lives under 6°; `move` ≈ 50°; `run` ≈ 130°; attacks 190–305°. Position
tracks are used nearly as widely as rotation — a generator emitting only
rotations produces visibly wrong motion.

**Clip usage in current content** (24 of 38 are referenced): `idle` 105×,
`move` 81×, `givereceive` 32×, `throw` 15×, `run` 13×, `move_carry_loop` 11×,
`greeting1` 9×, then a long tail.

**Derived-clip graph** — regenerate a parent without its children and they
desync (documented in [`catalog.ts:706-742`](../lib/spum/catalog.ts#L706-L742)):
`throw` ⊂ `axe_attack`; `give` = reverse(`receive`); `givereceive` =
`give`+`receive`; `getup` = reverse(`death_sleep`); `move_carry*` = `move` legs
+ `greeting2` arms.

**Constraints, all now enforced in code:** keyframes on the 60fps integer grid
(`checkClip`); loopables close, or the clip snaps every cycle (`checkClip`, and
the editor edits both loop endpoints together); durations locked to the
engine's so scene timings don't shift (module-load assertion in
`clips/index.ts`, plus a test that reads `public/spum/anims/`); contact poses
kept and labelled `role: "contact"` for `givereceive` and `throw`, which hand
props off; `HeadSet`, `Shadow` and the eye-blink tracks never emitted at all.

**Clip usage counts, re-measured 2026-07-28** (296 total references — the doc's
earlier numbers were close but drifted): `idle` 93, `move` 72, `givereceive`
34, `throw` 14, `move_carry_loop` 11, `greeting1` 7, `run` 7, `greeting2` 6,
then a long tail. Table lives in `lib/aachar/clips/index.ts` as `CLIP_USAGE`.

**What is NOT done.** ✅ *Closed 2026-07-29 (Phase 6d).* Every clip content
references is now authored. What still plays SPUM's motion is only the 13
engine clips **nothing references** (`jump`, `jump2`, `die`, `sit`, `sleep`,
`run2`, `axe_attack`, `skill_bow`, `skill_melee`, `short_sword_attack`,
`long_spear_attack`, `death_sit`, `debuff_stun`) — they fall through by design
and cost nothing until a lesson plays one.

---

### Phase 7 — Content integration 🟢

**Done (2026-07-30).** A scene casts an AA character by NAME and gets the
full editor look. Authoring guide: **`docs/spum-scene-authoring.md` §25**
(that doc now declares AA the default for new scenes; SPUM configs are
legacy). First shipped use: `unit1-lesson1b-ex8` — Ida replaces Griselda's
SPUM rig, same actor id, zero action/prop-anchor changes.

```
lib/aachar/sceneCast.ts          bundle fetch (manifest + skeleton, once per
                                 session) · resolveAaSceneActor (sync) ·
                                 bakeAaSceneLook (async, editor bake order)
lib/aachar/AaSceneCharacter.tsx  the component SpumScene renders for
                                 `aachar` cast entries
lib/spum/types.ts                SceneActor.aachar {name, hide?} · config now
                                 optional · SceneScript.light
lib/spum/SpumScene.tsx           the cast-map branch + config?-safe folding
content/validation.ts            SceneAaSchema · config-or-aachar · no-mount
                                 · light enum · roster check hook
scripts/validate-content.ts      reads the manifest via fs, passes the
                                 character-name roster into validation
```

The shape the plan predicted held: `SceneActor.aachar = { name, hide? }` →
`atlasOverrides` + `skeletonOverride` + `slotAdjustments` + per-animation
`clipOverride` (recompiled on every play action; unknown name → null → the
renderer's SPUM fetch, the safety net). `resolvePart` stayed unused — the
manifest is one fetch and every part is already in it.

Decisions / gotchas recorded on the way:
- **The scene id is not the character.** ex8 keeps `id: "griselda"`; all
  actions and bone anchors are untouched. Rig swaps are cast-entry edits.
- **`hide` exists because characters carry props of their own.** Ida is
  authored holding an axe in `weapon` — the same `R_Weapon` bone ex8's cash
  and blender anchor to. `hide: ["weapon"]` strips picks per scene without
  forking the character. Applied BEFORE the bakes, so a hidden helmet also
  stops hat-hair, like the editor's hidden-slots toggle.
- **Banned clips bite scenes now.** ex8's exit played `move_carry` (banned →
  resolves to `idle` = a slide). The exit now plays `move_carry_loop`
  directly at t=4.5. Grep for banned names when migrating a scene.
- **The look bake is the editor's chain verbatim** (recolour → hat-hair →
  eye nudge → eye-state swap → shade), served by the same lib/aachar caches.
  First paint is the BAKED look, never raw art (2026-08-10, killing the
  "green hair snaps to blue" flash): finished looks land in a sync-peekable
  cache (`sceneCast.ts` `peekAaSceneLook`), the quiz prewarms every AA look
  its lesson can render at mount (`scenePrewarm.ts`, wired in
  `src/screens/lesson/quiz.tsx` — covers scene casts, MATCHING tile scenes,
  SHAREOSELECT busts, SORTABLE2 zone characters, CONVO speakers), and a
  stone-cold actor HOLDS for its first bake instead of flashing raw. Stale
  direction/gaze still serves during re-bakes (facing flips), and raw art
  remains the floor under a bake that rejects.
- **`SceneScript.light`** landed as promised (Phase 13's deferral): one enum
  for the whole scene, `effectiveLightDirection` handles the facing mirror.
  Per-clip eyeState/gaze in scenes, scene eye/gaze ACTIONS, ground shadows
  in scenes, AA-original clip names in the scene schema, and mounts are the
  recorded follow-ups.
- **Roster check is node-side.** The manifest is outside the module graph
  (D5), so browser-side Zod only shape-checks `aachar.name`;
  `scripts/validate-content.ts` (runs before dev + build) reads the manifest
  off disk and fails the build on an unknown name. `hide` slots ARE
  Zod-checked (AA_SLOTS is a static import).
- **`SceneActor.config` went optional**, which forced the one crack in the
  "never touch `src/screens/admin-spum/`" rule: `SpumSceneEditor`'s ActorRow
  read `actor.config` ~17 times and would ALSO have crashed at runtime
  loading any scene with an AA actor. It now binds a safe local and renders
  a compact row for AA actors. Behaviour for SPUM actors is unchanged.
  *(2026-08-04: the compact row grew into a real authoring row — see the
  session log; AA scenes are now constructible in the scene editor, no
  hand-editing.)*

Watch out for **I4** still: prop/bubble offsets in migrated scenes were
eyeballed against SPUM proportions — replay each scene after a swap.

---

### Phase 8 — Library import: props / sprites / modern as hi-res parts 🟢

**Done (2026-07-29).** Any prop-catalog PNG, sprite-sheet frame, or modern-pack
item can be imported as hat / clothing / item (and hair / mouth) art — at its
**original resolution**, freely resizable, with a per-part choice of smooth or
crisp scaling. User ask: "import any prop/sprite/modern into my character
creator… resize them… not pixelated, just as they are."

```
lib/spum/types.ts                       SpriteAtlas.pixelDensity + .smooth (the seam)
lib/spum/SpumCharacter.tsx              1/density folded into slice scale; smooth → image-rendering: auto
lib/aachar/hires.ts                     placement ↔ atlas math (pure, tested)
lib/aachar/hiresImport.ts               decode / trim / cap-at-512 (browser)
src/screens/admin-aachar/LibraryBrowser.tsx    Props / Sprites / Modern modal
src/screens/admin-aachar/HiResPartEditor.tsx   the transform panel
```

**The renderer seam is two optional atlas fields, and that's the whole trick.**
A slice is a native-px box scaled up by a CSS transform, and slices already
carried per-axis scale (`PART_ADJUSTMENTS`), so `pixelDensity` (source px per
logical px) folds in as `1/density` and the art occupies `height/density`
sprite px on the rig. Because the shrink is a transform, the browser samples
the native source at final display resolution — `smooth: true` swaps that
slice's `image-rendering: pixelated` for `auto` and hi-res art renders sharp.
Absent fields → byte-identical DOM (density 1 leaves `scaleX` undefined, not
1). Pivot, origin and clip-path math needed no change: origin is computed in
native px and the translate sits inside the scaled frame.

**Resizing is LOSSLESS — display size is a number, not a property of the
pixels.** A hi-res part stores its imported PNG once (trimmed, capped at the
endpoint's 512px), and every resize just rewrites `pixelDensity`. `smooth` is
deliberately separate from resolution: a 48px LimeZu item wants crisp
nearest-neighbour, a 200px craftpix icon wants smooth — both resize freely.
Default: smooth on only when the native art is taller than 64px.

**One region, position in the pivot.** `buildHiResAtlas` declares a single
region covering the whole image (no gutter needed — nothing neighbours it) on
the slot's routed region name; the author's dx/dy offset from the anchor is
encoded as the region pivot, exactly the trick headroom uses. Cloth maps to
its torso region only — sleeves stay pixel-authored. `readHiResAtlas` inverts
it, so reopening a part shows the numbers it was saved with. **Detection is
field PRESENCE, not value**: a part at density exactly 1 still routes to the
transform panel — hydrating a native-res sheet into the pixel canvas is the
failure mode this guards (the Slots tab also refuses to adopt a hi-res
region's size as the slot canvas).

**Two import modes from one browser modal.** "As-is" lands in the
`HiResPartEditor` (display-height slider, drag-to-place against the model's
own head/torso ghost — with the Phase 5d head-offset correction — smooth
toggle, live rig preview); "Pixelate" hands the same art to `PartCanvas`'s
existing floating-draft flow via a new `externalFile` prop. Sprite entries get
a per-frame picker (frame rect cropped client-side); modern items ride the
existing `/modern-packs` dev endpoints and importing one materialises it into
`public/aachar/` — same shipping status as promoting it.

**Knock-ons handled:**
- **Hair mask is density-aware** (`mask.ts`): the math now runs in logical px
  with each sprite's own quantities converted by its own density, and the crop
  converts back to hair NATIVE px at the end (the clip-path lives in the hair
  slice's own box). At density 1/1 every conversion is identity — pinned by a
  test that doubles the fixture and demands the identical mask. The imported
  helmet's `contentBottomProfile` is measured from its native pixels on save.
- **Recolour**: `recoloredAtlas` spreads the source atlas, so density/smooth
  survive a per-character appearance pass untouched; channel tagging is
  pixel-art-only and the hi-res editor simply doesn't offer it.
- **Save path**: the endpoint rebuilds the atlas field-by-field (so unknown
  request fields can't ride into the written file) — `pixelDensity`/`smooth`
  are named there explicitly and validated (finite, (0, 64]); manifest
  validation accepts them plus the new `AaPart.source` provenance string.
- **Isolation intact**: the browser reads `propCatalog` / `spriteCatalog` /
  the modern index READ-ONLY from the screen layer; the imported pixels are
  fully materialised under `public/aachar/`, so deleting the source can never
  break a character. Nothing imports from `src/screens/admin-spum/`.

Verified end-to-end in a headless browser (no Save clicked, no disk writes):
browse → search → as-is pick → hi-res editor with live rig slice carrying the
native data URL → smooth toggle flips that one slice to `image-rendering:
auto` while the character's pixel art stays crisp → display-height slider
moves the slice transform → Pixelate pick lands as a floating draft → modern
tab loads. 29 new tests (hires math, density mask, plugin passthrough); full
suite 1386 green; tsc + lint clean.

---

### Phase 9 — Text stamps: words on clothing, hats, anything 🟢

**Done (2026-07-29).** User ask: *"add words to clothing… a few different
fonts including fonts with shapes/designs like webdings… lots of pixelated
fonts and fonts that look great tiny… also in hat… extensible to
props/modern/sprites later."* Full documentation lives in
**`docs/pixel-text.md`** — this entry records what shipped and the choices
that touch this pipeline.

```
lib/pixeltext/                       NEUTRAL module — no spum/aachar imports
  types.ts render.ts fonts/ index.ts pixeltext.test.ts
src/screens/admin-aachar/PartCanvas.tsx   the "Text" section + text drafts
```

- **Six hand-authored bitmap fonts** (clean-room, same standing as the clip
  library's originality rule): nano 3×4, micro 3×5, slim 3×6, standard 5×7
  with real lowercase, chunky bold, and dingbats — a webdings-style icon font
  (A=arrow, H=heart, S=star, X=skull, 5=money bag, …). Variable-width glyphs,
  every font covers A–Z 0–9 `$`, all validated at module load. Style options
  multiply the set: integer scale, 1px outline (pre-scale), italic slant,
  letter/line spacing, multi-line with alignment.
- **The tool rides the floating-draft machinery.** A text stamp is a third
  way to fill `draftArt` — same drag / nudge / Enter / Esc, same anchor-centred
  landing as an image import — but re-rendered from its live spec (text, font,
  colours) on every edit, and it **always composites** (words go ON the shirt;
  "clear the region first" stays file-import-only). Because `PartCanvas` is
  shared, it exists on every slot, not just cloth/helmet.
- **Stamped text is baked pixels.** Recolour channels, the hair mask, save,
  export — all downstream systems see ordinary art. No text layer, nothing to
  migrate.
- **Why not canvas `fillText`:** at 3–7px, vector rasterisation is
  anti-aliased mush and browser-dependent; bitmap glyphs are deterministic and
  designed for the pixel budget. Why `lib/pixeltext/` is NEUTRAL: so the
  future prop/modern/sprite text feature imports the same engine without
  coupling the pipelines (extension recipe in the doc).
- ⚠️ The global key handler in `PartCanvas` now **ignores events from form
  fields** — the stamp panel's textarea needs Enter/arrows, and previously
  typing in ANY panel input could nudge a draft or trigger canvas undo.

Verified: 18 new tests (registry/format invariants, measure↔render agreement,
outline, scale, slant, alignment); full suite 1404 green, tsc + lint clean.
Reviewed by LOOKING per this plan's rule: a full glyph specimen of all six
fonts rendered through the real vite transform, plus an in-editor stamp on
the real cloth part (draft rect on the Body region, text composited over the
shirt, Place live).

**9b — hi-res text (same day).** Playtest follow-up: *"an option that
doesn't pixelize these, just lets me resize them… a variety of fonts…
some that are pixel fonts but treat them normally."* `lib/aachar/textArt.ts`
renders text with REAL fonts (canvas `fillText`, ~14 Windows-first system
stacks with generic fallbacks) — or any pixeltext font at a large integer
scale, never re-quantised — at native resolution, and the Slots tab's
**Text…** button lands it as a **Phase 8 hi-res draft**: the existing
transform panel provides the lossless resize, drag placement, smooth/crisp
and Save with zero new plumbing. System text defaults smooth, pixel text
crisp, via a new explicit `HiResDraft.smooth` (the size heuristic can't tell
a 72px-tall pixel render from painterly art). A text part replaces the
slot's art (it IS a hi-res part); words layered over existing pixel art
remain the pixel stamp's job. Re-creating with edited text remounts the
panel via a seq in the draft's `source`, since the panel seeds its art from
the draft once. Verified in-browser both ways on the hat slot: Impact
"CPA" (204×119 native, smooth, 7.44× density at 16px) and Chunky-pixel
"TAX" (crisp default) live on the rig.

**9c — stamp ONTO the existing part (same day).** Playtest: *"if there's
already a shirt, it should stay and the text goes over top."*
`lib/aachar/textMerge.ts` + a **"Stamp onto \<part\>"** button on any hi-res
draft (text or library import) whose slot had an active part: the draft
bakes OVER that part's art at high resolution and the part keeps its name,
channels, protection and provenance. A PIXEL part is first upscaled ×U
(nearest-neighbour, visually unchanged; U = ceil(draftDensity), capped by
the 512px save limit) and becomes hi-res at density U — **the whole sheet
upscales, so every region survives with its pivot, sleeves included**. The
draft clips to the routed region (pixel-stamp rule), the target draws as a
ghost in the alignment canvas so words are placed against the actual shirt,
and a helmet's `contentBottomProfile` is re-measured from the merged pixels.
⚠️ The result can be **multi-region AND hi-res** — a combination
`readHiResAtlas`/`buildHiResAtlas` cannot round-trip (they'd drop the
sleeves) — so the transform panel detects it (`hiResExtraRegionNames`),
locks Save/placement with an explanation, and previews the on-disk atlas
as-is. 6 new tests (upscale cap, region scaling, extra-region detection);
suite 1415 green. Verified in-browser on the real shirtpants without
saving: merged 495×165 @ density 15, Body/Right/Left all present, "ACME"
composited over the shirt.

---

### Phase 10 — Outfit presets + a naming pass 🟢

**Done (2026-07-29).** Two frictions in how the Characters tab was actually
being used: themed looks were being authored in batches (ninja / scrubs /
astro / …) but the only container for a look was a whole character, and the
add-character prompt's fixed default had produced a roster named "afsdf",
"dfg", "gsdfgsdfgdsf".

```
lib/aachar/types.ts        AaOutfit + AaProject.outfits
lib/aachar/character.ts    outfitFromCharacter / applyOutfit / wearsOutfit /
                           upsertOutfit / removeOutfit / validateOutfit
lib/aachar/names.ts        suggestCharacterName (48-name pool) / suggestOutfitName
src/screens/admin-aachar/CharactersTab.tsx   Outfits section + prompt defaults
```

**An outfit is the LOOK half of a character** — picks, colours, appearance,
placement — and never the skeleton: an outfit is clothes, and putting the
ninja suit on a tall character shouldn't shorten him. Same build/outfit line
the Randomize button already draws. Applying is a WHOLESALE replace (wearing
an outfit means wearing *that* outfit, not layering it over the last one), so
a slot the outfit doesn't name is emptied. `wearsOutfit` compares looks
through a key-order-insensitive serialization and drives a "wearing" marker
in the tab.

**Storage rode existing rails end-to-end.** Outfits live on the project
beside the characters (`AaProject.outfits`, deleted rather than stored when
empty); the manifest autosave, the save endpoint (which stringifies the
project verbatim), and the export bundle (which spreads it) all carry the
field with zero changes. Only validation needed extending — `validateOutfit`
shares the character's look validators (extracted, not duplicated), outfit
picks are deliberately NOT resolved against the part library (same
validate-before-parts-exist rule as characters), and a pre-Phase-10 manifest
with no `outfits` field validates unchanged.

**Names.** `suggestCharacterName` fills the add prompt with an unused,
NAME_RE-valid pool name ("Bram" deliberately absent — that's the story's
character); `suggestOutfitName` derives the save-outfit default from the
cloth pick with the batch cloths' meaningless `shirtpants` prefix stripped
(`shirtpantsninja` → "ninja"), numbering past collisions.

Verified: 28 new tests (capture/apply/round-trip, key-order equality,
validation accept+reject, name-pool invariants); full suite 1443 green, tsc
clean, lint no new warnings. Headless browser pass on the real project:
Outfits section renders between Wearing and Placement, both prompts open
with valid suggested defaults, no writes.

---

### Phase 11 — Eye states (open / half / closed) 🟢

**Done (2026-07-30).** Three eye states per character, so a resting
"sleepy/chill" look is a personality trait and a blink/closed pose is
authorable art rather than a vanished sprite. See the session log entry for
what shipped where. Decisions, locked before code:

- **Eye state is a render-time REGION SWAP, not bones or clip tracks.** The
  skeleton is measured from the SPUM prefab and doesn't grow (D2), and a
  keyframed eye channel would ripple into `checkClip`, loop-closure analysis
  and the clip editor for no expressive gain — the engine's own eye moves are
  all static whole-clip visibility flips. An `eyeState` value selects which
  band's rect the atlas's `Free` region points at; the renderer never learns
  the feature exists. `lib/spum/` is untouched — the renderer already skips
  regions it doesn't recognise on the open-eye bone
  (`SpumCharacter.tsx:922`), and `remapFreeEyeArt` turned out to be
  Part-Studio-only, so the AA editor's own `migratePixels` path carries the
  band migration.
- **States are per-PAIR, not per-eye** — the band contains both eyes as one
  drawing. Bands can be asymmetric, so a wink is "just another band" someday,
  not per-eye state machinery.
- **Band order:** `Free` (open) / `FreeHalf` (half) / `FreeClose` (blink),
  each its own gutter-separated band. `FREE_EYE_HALF_REGION` is defined in
  `lib/aachar/slots.ts`, NOT `lib/spum/freeEye.ts` — the SPUM side never
  needs the name.
- **`eyeState` lives on the CHARACTER, not the outfit** — resting sleepy eyes
  are personality/build, not clothes; same line D12 draws. Characters rest at
  `open` (absent, deleted-not-stored) or `half`; `closed` is scene/clip
  territory only.
- **`AaPart.eyeBands` flags (has-real-art per band) are written at SAVE
  time**, never by pixel-scanning at load — atlas pixels aren't in memory.
  A part without flags never swaps, which is exactly what keeps old 2-band
  parts and blank bands rendering unchanged (and finally guards the "blank
  close band = eyes vanish during `die`" gotcha for flagged parts).
- **Per-clip `eyeState`** is a single optional static field the preview
  applies for the clip's duration — covers everything SPUM's originals did
  (`damaged`, `concentrate`) except `die`, which nothing references. No track
  machinery; duration/beats/originality-gate untouched.
- **Scene-level eye state is DEFERRED to Phase 7** — nothing outside the
  editor renders an AA character yet, so the action would be dead code. Shape
  when it lands: an actor-property action (open/half/closed), same pattern as
  other actor properties; future gaze ("looking up-left") composes on top —
  state picks the band, a gaze pixel-pass moves pupils within it.
- **Future payoff:** idle blinking is a small player timer stepping
  open → half → closed → half → open in the swap layer; the half band is what
  makes it read as a blink.

---

### Phase 12 — Pupils: per-eye nudge + gaze 🟢

**Done (2026-07-30).** The other half of the original eyes ask (the first half became Phase 11):
tell the editor which pixels are eyes and which are pupils, then (a) nudge
each eye independently per character and (b) point the pupils ("looking
up-left") — with the pupil confined to the eye's whites, ALWAYS. Decisions
locked before code:

- **Same seam as Phase 11: a pixel-rewrite pass, no renderer changes.** The
  pass runs between hat-hair and the eye-state band swap: rewrite pixels
  (nudge + gaze) on the atlas image, then the swap repoints rects. Zero
  `lib/spum/` changes.
- **`AaPart.eyes` metadata, authored on the OPEN band, band-relative
  coordinates.** `{ left, right }`, each `{ box, pupil }` — left/right ON
  SCREEN (the character faces screen-left; naming them anatomically is the
  his-left/your-left trap). Band-relative so the same boxes serve every band
  and survive sheet re-layout (bands are always the same size).
- **Masks are computed, not stored.** Pupil = the connected exact-colour
  region containing the clicked pixel, clipped to the box. Whites = opaque
  box pixels that are neither pupil nor outline-dark (OKLab lightness ≤
  `DEFAULT_PROTECT_LIGHTNESS`, the same constant the recolour outline guard
  uses). Stored masks would go stale the moment the art is retouched;
  computed ones can't.
- **Gaze range is DERIVED: an offset is valid iff every pupil pixel stays
  inside the box on whites-or-vacated-pupil.** A direction name means "the
  furthest valid offset that way" — big eyes wander far, tiny eyes barely,
  and the pupil can never leave the eyeball. No per-part tuning exists.
- **Vacated pupil pixels are filled with the nearest whites pixel's colour**
  — right for flat and lightly-shaded scleras, which is what this art is.
- **Per-eye nudge lives on the CHARACTER** (`eyeNudge.left/right`, dx/dy in
  the placement convention: +dx screen right, +dy up; identity deleted).
  It moves the eye's whole box content and applies to EVERY band — the eye
  should sit where you put it when it blinks too. Gaze applies only while
  the OPEN band shows (other bands' pupils are unmarked; half-band gaze can
  be added later by marking pupils there).
- **Gaze is an authoring lens + clip metadata, not character data.** A
  Slots-tab direction pad previews it; `AaClip.gaze` mirrors
  `AaClip.eyeState` (static whole-clip, validated, Copy-TS round-trips);
  the scene-level action lands with Phase 7 like the rest. A permanently
  side-eyed character is better served by a dedicated eye part.
- **Auto-detect pre-fills, the author decides.** Connected components on the
  open band's alpha usually find exactly two blobs (the gaps between the
  eyes are real); the two largest become suggested boxes, leftmost = left.
  Glasses/cyclops/connected art fall back to the marquee-selection route
  ("Selection → left/right box").

### Phase 13 — Auto-shading + shadows ("lighting") 🟢

**Done (2026-07-30).** Parts are authored FLAT; volume is generated — a rim of
darker pixels along the edges facing away from the light, the one- or
two-step edge shade a pixel artist would draw, applied uniformly to every
part of every character (consistency is exactly what hand work is bad at).
Decisions locked before code:

- **A render pass, not an editor bake.** The same seam as recolour/hat-hair:
  `lib/aachar/shade.ts` (pure, tested) + `shadeAtlas.ts` (decode → pass →
  data URL, cached, `clearShadeCache` on save) + `useShadedOverrides`,
  chained LAST — shading must see the FINAL pixel colours (recoloured ramps,
  baked hat-hair, nudged eyes). Source art stays flat and clean; zero
  `lib/spum/` changes.
- **Shade in RAMP SPACE.** A pixel whose colour sits in a tagged channel ramp
  steps to the ramp's next darker entry (`effectiveRamps` replays what the
  recolour + appearance passes did to each entry, protected colours spared),
  so the shadow stays on-palette and follows a recolour. Only off-ramp
  colours synthesise a step (OKLab: −0.09 L, chroma ×1.15 — ramps saturate
  as they darken).
- **Protected colours are BACKGROUND.** The outline is never darkened and the
  fill pixel inside it takes the shade line — where a hand-shader puts it.
  Interior outlines (hem, chin) grow shade on their away side for free.
- **Light direction is a PARAMETER, not character data.** A tiny enum
  (`left`≈top-left default / `top` / `right` / `below` for the campfire
  underlight — same rim math, inverted offset), because every baked asset in
  the game carries an implied top-left light and a continuous angle would
  explode the bake cache for differences invisible at sprite scale. The
  character stores its `shading` STYLE (`soft` 1px dithered / `cel` 1px
  solid / `hard` 2px + lit-edge highlight, identity-deleted); direction comes
  from the 💡 preview picker now and a scene's `light` field after Phase 7.
  `effectiveLightDirection` swaps left/right under a mirror so a flipped
  scene actor stays correctly lit.
- **Rim depth and dither scale with `pixelDensity`** — a hi-res part's "1px"
  rim is density buffer-pixels thick, so the shade reads the same at every
  resolution.
- **The EYE slot is never shaded** — at sprite scale a dark rim on the whites
  reads as dirt, and the gaze/eye-state bakes would carry it into every band.
- **Ground shadow is COMPOSITED, never baked**: `groundShadow` on the
  character (`ellipse` — radial-gradient div offset away from the light /
  `silhouette` — the same rig blackened, flipped about the feet and skewed
  away from the light, so it follows the pose for free). `below` degrades
  both to a small contact ellipse (an underlight casts up, not onto the
  floor).
- **Deferred, by design**: occlusion shading (darken part B under part A's
  silhouette — the brim case already ships as `spillShadow`) and the
  `SceneScript.light` plumbing, which lands with Phase 7 and is pure wiring —
  everything here already takes direction as an input.

---

### Phase 14 — Theme tags + the Randomize filter (and the zombie set) 🟢

**Done (2026-07-30).** Born from the first themed character (Zed the zombie):
themed parts must be authorable without leaking into every random villager,
and the skin channel must not hand Randomize a licence to paint people purple.

- **`AaPart.tags?: string[]`** — lowercase slugs (`PART_TAG_RE`, deliberately
  narrower than NAME_RE: `"Zombie"` vs `"zombie"` would silently split one
  theme into two filters). Authored as chips next to the Delete button in the
  Slots tab; metadata-only writes through `upsertPart`, so tagging never
  touches pixels and rides the manifest autosave.
- **Randomize excludes tagged parts BY DEFAULT.** `randomizeCharacter` gained
  an `excludeTags` set applied when building each slot's pool. The Characters
  tab shows a "🎲 excludes" checkbox row (one per tag in the library, via
  `allPartTags`), pre-checked = excluded. Persistence stores the INCLUDED
  set (`aachar-random-included-tags` in localStorage), so a tag that appears
  later — next month's "boss" theme — defaults to excluded with no migration.
  Tags never hide a part from the Wearing pickers: choosing a zombie eye on
  purpose is the point.
- ⚠️ **If exclusion empties a slot's pool, the slot behaves as LOCKED** (keeps
  its part, colours, and — for the eye slot — resting eye state) rather than
  stripping the character. Rerolling with "no zombie parts" must never undress
  a zombie's body. Pinned by test.
- **`AaColorChannel.randomPalette?: string[]`** — Randomize draws this
  channel's colour from a curated list instead of `randomTint`'s any-hue.
  The torso's `skin` channel now carries eight plausible skin tones, so
  random villagers get diversity instead of purple. Never limits the
  Characters-tab picker.
- **The zombie set** (all tagged `zombie`, picked by Zed and the `zombie`
  outfit): `zombieeyes` — the project's first eye part with real art in ALL
  three bands (`eyeBands` half+close true, so the sleepy resting state and
  blink-capable clips finally have something to show) plus `eyes` metadata
  for nudge/gaze; asymmetric dead stare — heavy-lidded left eye with a low
  pupil and one bloodshot pixel, small rolled-up right eye. `zombiemouth` —
  stitched grimace with a lone tooth. `shirtpantstorn` — `shirtpants` with
  punched tears (the body's skin shows through the holes, so it follows any
  skin recolour) and a ragged hem, same colour channels. The body slot got
  NO zombie variant on purpose: BodyEditor only reaches
  `partsInSlot(model, "body")[0]`, so a second body part would be uneditable
  (noted as the body-slot gap in I12); zombie skin comes from the `skin`
  channel instead.

**14b — asset wave 2 (same day): the tatter pass + more faces.** The
highest-leverage zombie asset turned out to be a MUTATOR, not a drawing: a
seeded per-part script punched a ragged hem (per column, bite the bottom-most
opaque pixel, sometimes two) and a few interior holes (non-outline pixels
only, so the silhouette's linework survives) into **every eligible cloth
part** — 36 `<name>torn` variants (zombie surgeon, zombie king, zombie
referee…), each keeping its source's colour channels/protect/authoredFor,
tagged `zombie` + **`generated`** (a second tag so machine-made parts are
filterable as a class; the include-set persistence auto-excludes it), with
`source: "generated:tatter(<name>)"` provenance. Skips: already-tagged,
hi-res, and `*torn` names — so reruns are safe and torn-of-torn can't happen.
Plus three authored eye parts (all 3-band + half/close flags): `droopeyes`
(yellowed sclera, low pupils, eye bags; `eyes` metadata — pupils deliberately
NOT touching the bottom ring, or the pupil flood would leak into the outline),
`holloweyes` (black sockets, mismatched white pinpricks; metadata for nudge —
gaze validly resolves to zero range since sockets have no whites),
`zombiexeyes` (mismatched X-eyes, no pupil so no metadata); and three mouths:
`jawagape`, `sewnshut` (X-stitches), `snarl`. Demo character **Mort** (undead
businessman: torn suit, slickback, hollow eyes, agape jaw, briefcase).
Reviewed by LOOKING: 8× contact sheet of all 6 face parts + 9 torn cloths,
then Mort on the rig.

**14c — the zombie generator button (same day).** The tag filter inverted:
`randomizeThemed(model, character, theme, locked, rng)` rolls each slot from
its **theme-tagged pool** where one exists and falls back to **untagged**
parts where the theme has no art (body, hair) — other themes' parts can
never leak in through the fallback. A `RandomTheme` is data (`tag`,
per-slot `presence` overrides, channel-id → palette map, `defaultPalette`,
`halfEyeChance`), so the next theme is a constant, not code. `ZOMBIE_THEME`:
skin from `ZOMBIE_SKIN_PALETTE` (rot greens/greys), every other channel from
`ZOMBIE_CLOTH_PALETTE` (grave dirt), hats/items mostly lost
(`helmet 0.2 / weapon 0.25`), 40% half-lidded. The 🧟 Zombie button sits next
to 🎲 in the Characters tab and respects the same slot locks. Both rollers
now share one `rollCharacter` core (pool rule + channel-colour rule + presence
+ half-eye chance are parameters), so the empty-pool-behaves-as-locked rule
holds for both by construction. Verified by generating "Patient0" through
the real button headlessly.

**14d — the raider set + 🪓 Raider button (2026-07-30).** The second theme,
proving `RandomTheme` really is data: `RAIDER_THEME` is a constant (gear
KEPT rather than lost — `weapon 0.85 / helmet 0.6` — rust/leather
`RAIDER_CLOTH_PALETTE`, 15% half-lidded) and the button is one more
`randomizeThemed` call. One new mechanism: `palettes: { skin: [] }` — an
EMPTY theme palette defers to the channel's own behaviour (its
`randomPalette`), which is how a theme keeps skin human while
`defaultPalette` repaints every other channel; pinned by test. All art is
script-generated by `scripts/aachar-raider-gen.js` (rerun-safe, upserts by
name): seven authored parts — `eyepatcheyes` (leather patch + strap over the
screen-right eye, all 3 bands, no `eyes` metadata on purpose — the
zombiexeyes precedent), `warpainteyes` (base-eyes trace + cheek claw
stripes OUTSIDE the eye boxes so gaze/nudge move the eye and the paint
stays; full metadata), mouths `gritmouth` / `sneermouth` / `bandanamask`
(the mask carries a `primary` channel so themes recolour it), hats
`spikehelm` / `headwrap` (viking-fit hem row 24, `contentBottomProfile`
computed) — plus the **patch pass**, the tatter pass's sibling: 37
`<name>patched` cloths (stitched patches + shoulder studs), tagged
`raider` + `generated`, `source: "generated:patch(<name>)"`. Patch
placement is tiered (all-light fabric → majority-light → any-opaque) so
striped/black cloths (prisoner, ninja, tuxedo) still get patches without
ever repainting linework on cloths that have a clean spot; patch colours
are nudged off any hex a channel ramp claims so recolours can't grab them.
Reviewed by LOOKING (8× contact sheet, `--sheet`); verified by rolling
Spike/Rusty/Gouge through `randomizeThemed` against the real manifest.

**14e — the robot set + 🤖 Robot button (2026-07-30).** Third theme, and the
first with a full CHASSIS: `scripts/aachar-robot-gen.js` authors two
complete 19×38 body sheets — `botbody` (antenna + square riveted head) and
`tvhead` (CRT with rabbit ears, screen seams at region cols 5/13, dials at
col 14) — sharing one boxy sub-neck chassis (panel-seam torso keeping the
neck skin at cols 7-10, 2px legs into square boots, 2px arms into open
pincer claws whose fist rows sit exactly where the base torso's fists sit,
so weapons anchor unchanged). Both follow the head-variety rules to the
letter: two colours only (`skin` `#e8c39e` + outline), face core solid,
head bottom row open, region rects untouched — so the ROBOT look comes from
paint, not pixels: `ROBOT_THEME` paints the `skin` channel from
`ROBOT_METAL_PALETTE` (chrome/copper/brass…), and the bodies' own channel
`randomPalette` is ALSO metals so an invited-back 🎲 roll can never deal a
flesh-toned robot. Faces: `ledeyes` (2px sensor pupils in `#29366f` — NOT
outline colour, or the pupil flood would leak into the frame; half = a
low-power dark top, close = off with one standby dot) and `visoreyes`
(one bar, red scanner segments), both with full `eyes` metadata + all 3
bands; mouths `grillmouth` (transparent gaps — faceplate shows through the
slats) and `wavemouth` (cyan voice zigzag). Theme data: cloth presence 0.3
(a bare chassis reads robot; a rusty android in a hawaiian shirt is the
comedy budget), hair 0.15, weapons 0.6. Reviewed by LOOKING (8× contact
sheet); verified by rolling Clank/Servo/Ledgertron against the real
manifest. NOT yet eyeballed on the live rig — the chassis limbs ride the
same bones/pivots as the base torso art, but the first in-editor look
should confirm the claw fists and boots track cleanly through clips.

**14f — the skeleton set + 💀 Skeleton button (2026-07-30).** Fourth theme:
`scripts/aachar-skeleton-gen.js` authors `bonebody` (skull with cheekbones
and a tapered jaw — jaw borders kept OUTSIDE the face core; ribcage as two
rib-shadow rows flanking a 2px bone sternum, detached from the silhouette
edges so it reads ribs, not stripes; pinched pelvis; 1px limb bones with
knee/elbow knobs; fists in the base positions), `socketeyes` (dark hollows
with a green glow pinprick as the pupil — full metadata, gaze validly
zero-range per the holloweyes precedent; half band is a squint, close is
the lash recipe) and mouths `teethmouth` (skull grin) / `boneagape`.
`SKELETON_THEME` paints the `skin` channel from `SKELETON_BONE_PALETTE` —
mid-lightness ivories, deliberately short of bone-white, which would
collapse the recolour ramp — and shares `ZOMBIE_CLOTH_PALETTE` as its
`defaultPalette` (grave dirt is grave dirt). **First theme-shared art:**
the script dual-tags the zombie's 37 `*torn` cloths `zombie` + `skeleton`
— a second tag is the whole mechanism (the pool rule checks
`includes(tag)`, plain 🎲 still excludes on either tag); pinned by test.
Cloth presence 0.35, hair 0.1 (a skeleton in pigtails is the gag budget).
Reviewed by LOOKING (the first ribcage draft read as stripes and was
redrawn); verified by rolling Rattles/Femur/Calcium against the real
manifest. Same rig caveat as 14e.

**14g — the cultist set + 🕯️ Cultist button (2026-07-30).** Fifth theme:
the Cult of the Ledger. First AUTHORED themed cloths —
`scripts/aachar-cultist-gen.js` draws `cultistrobe` (eye-of-the-ledger
chest sigil, gold rope belt with hanging tail) and `sigilrobe` (V-seam,
open-ledger sigil) in the house cloth style (flat fields, no outline, base
collar rows kept so the neck seam reads the same) and uses region row 8 —
empty in every shirt — as the robe's extra length. Arm regions stay empty:
no cloth has ever shipped sleeve art, so robes read over bare arms rather
than pioneering the sleeve path (noted as an opportunity). `cultisthood`
hangs side curtains past the normal hat hem (rows 25-31, 7px face gap) —
the first helmet to use the space below the brim — with a gold band on the
hem row. `tranceeyes` are solid possessed gold (no whites/pupil → no
metadata, the zombiexeyes precedent); mouths `chantmouth` (hollow "o") /
`blissmouth`. **New channel mechanism:** gold accents live on a dedicated
`sigil` channel id so `CULTIST_THEME.palettes` can gild exactly that
channel while `defaultPalette` (vestment darks) takes every `primary`, and
each sigil's dark centre is NEAR-BLACK on purpose — the protect threshold
keeps it constant through any recolour. Skin rolls from a curated pale
palette. Pinned by test (three channels, three palettes, one roll).
Reviewed by LOOKING; verified by rolling BrotherDebit / SisterCredit /
TheAuditor (who drew the ledger) against the real manifest.

**14i — the helmet set (2026-08-08, `scripts/aachar-helmet-gen.js`).** Seven
real HELMETS plus a `*back` for each — the same helmet worn backwards, shell
covering the face: `barbute` (steel skull, brow ridge, 1px nasal),
`centurion` (bronze, transverse crest; the back adds the flared neck guard,
which is the only tell since the crest runs front-to-back), `spangenhelm`
(riveted conical, mail aventail; the back's aventail covers the face, which
is what a real one does turned round), `motohelm`, `gridiron` (the mask is
1px bars, so the face reads THROUGH it), `divinghelm` (brass sphere +
porthole; the back swaps it for the air-hose hatch), `pilothelm` (leather,
goggles up on the crown; the back shows only the strap and buckle).
Untagged, so they stay in the random-villager pool. Every part carries a
`shell` colour channel (`stripe` too on the two lacquered ones).

⚠ **They are drawn in a DIFFERENT ROW BAND from every other hat**, and that
is the whole point of the set. Shipped hats live in sheet rows 19-29, i.e.
above the skull — they are drawn to perch on HAIR, which is why the fedora
and gradcap float over a bald head (see the professor generator's header).
A helmet that grips the head has to work in rows 24-37, because the `torso`
head actually lands at:

```
row 29 cols 16-20 · row 30 cols 15-21 · row 31 cols 14-22
rows 32-36 cols 13-23 · row 37 cols 14-22 · centre col 18
mouth (faceHair) rows 35-36, cols 15-18
```

Derived from the bones (helmet anchor row 30; `P_Helmet` 8.5px above
`P_Head` vs the head sprite's 6px; head region pivot .5 ⇒ top edge at row
28.5) and cross-checked twice: `InvestorHeadAvatar`'s measured "chin ~11,
hat top ~39 sprite px above the feet" resolves to the same 28.5, and every
shipped HAIR part ends its art exactly on that crown line. `HEAD_ROWS` in
the generator is that table, and three build-time checks run off it — the
shell must cover the head's own outline columns (or it is a floating hat), a
front must leave ≥20px of skin showing, and a `*back` must leave ≤2px above
the chin.

Two non-obvious choices worth keeping: content is symmetric about **column
18** (the head art's own centre — the professor generator's `row()` helper
centres odd widths on 17.5, which shows as a half-pixel-wider cheek on one
side of a face-hugging helmet); and openings are cut with `carve()`, which
clears the span and then rims it, because a hand-placed rim leaves gaps at
the chamfers of anything non-rectangular. Four failure modes found by
LOOKING and fixed: a rectangular opening reads as a letterbox, not a face
(hence `arch()`); a light-steel facemask over `#e8c39e` skin washes the
whole face to one pale block (the bars are mid steel); brass-on-brass gives
a warm blob with a hole in it (the porthole rim is cool slate/black); and
**any two marks side by side on a backwards shell read as eyes** — the
diving helmet's first back had two white bolts over a dark boss and looked
like a face, so its bolts became a continuous band and the boss one big
centred hatch. Review loop: `--review <png>` composites every part over the
real `torso` head and `happy` mouth at the measured offset.

⚠ Eyes render ABOVE the helmet (`EYE_Z_LIFT`), so a backwards helmet still
shows the character's eyes on top of the shell. That is the renderer's rule,
not something these parts can opt out of; a character meant to be fully
faceless needs `eye: none` or a `hide`.

---

## 5. Known issues & risks

- **I1 — Silent no-op sliders.** Editing an animated bone's `defaultPos` does
  nothing (§3). Guarded in code (`POS_ANIMATED_BONES`, `composeSkeleton`
  reports what it dropped); Phase 5 must surface it in the UI too.
- **I2 — Body sheet needs finished feet.** Consequence of dropping `pant`
  (Phase 3).
- **I3 — Stale parts.** ✅ *Addressed in Phase 3.* Since geometry is explored
  before being settled (D11), art drawn against an older geometry sits in rects
  that are no longer those sizes. Saved parts record `authoredFor` and
  `isPartStale` flags the mismatch in the UI; inside the editor,
  `migratePixels` re-packs the live canvas pivot-aligned so a geometry tweak
  keeps the art. A saved part that later goes stale is repaired by reopening
  the Body tab — hydration runs the same migration, so re-saving writes it back
  aligned to the current geometry. **Remaining gap:** that repair is manual and
  only covers the body slot; Phase 4 should generalise it to every slot.
- **I4 — Existing scenes shift.** Prop/bubble anchors are bone-relative so they
  follow automatically, but offsets in content were eyeballed against SPUM
  proportions. Not breakage; needs a visual pass if an AA character is ever
  swapped into old scenes.
- **I5 — Catalog-coupled behaviour.** `resolveHideHair` and `isShieldPart` read
  SPUM lookup tables. The AA path bypasses them via D9 rather than porting them.
- **I6 — Undo persistence.** Only the pixel buffer is persisted today, not undo
  stacks. If undo should survive a reload that's IndexedDB, not localStorage.
- **I7 — Animation is open-ended.** ✅ *Addressed in Phase 6; closed in 6d.*
  Bounded by authoring to COVERAGE rather than completeness, with unauthored
  names falling through to SPUM's clip. As of 2026-07-29 every referenced
  clip is authored (100% of references, 25 of 38 clips); only the 13
  unreferenced names still fall through.
- **I9 — `resolveBeat` and `truncateClip` are untested in anger.** Both are
  exercised by unit tests but no authored clip uses them: `truncateClip` exists
  because `throw ⊂ axe_attack` is how the engine made its throw, and the AA
  `throw` is authored directly instead. Kept as the documented derivation, same
  standing as `resolvePart` (Phase 1).
- **I10 — Variant tiles each run their own rAF.** Eleven live rigs on the
  Variants view. Fine at the sizes used (verified), but a larger grid or a
  heavier character would want pausing the off-screen ones.
- **I11 — The editor booted from localStorage ONLY, and autosaved over it.**
  ✅ *Fixed 2026-07-28, after it cost a session's work.* Two faults compounding:
  1. `AaCharAdmin`'s autosave effect ran unconditionally on first render, so any
     reason `loadDraft()` returned null — a corrupt entry, a cleared origin, a
     browser evicting storage — wrote the blank starting project straight over
     the real draft before anything was on screen. Unrecoverable by design.
  2. **Nothing ever read `public/aachar/manifest.json`.** D5 calls it the
     durable copy and it is written by Save, but the editor only ever loaded the
     localStorage draft — so a lost draft looked exactly like a lost project,
     even with every PNG and atlas sitting on disk.

  Now: a write that would SHRINK the stored project stashes the old one under
  `aachar-project-v2-prev` and the Project panel offers to restore it; booting
  with **no parts** adopts the manifest; and a **Load from disk** button does it
  on demand.

  ⚠️ **The recovery condition is "the project has no PARTS", not "there is no
  draft".** The first fix gated on the draft's existence and therefore did not
  fire in the only case that mattered — a clobbered boot leaves a draft behind,
  a valid empty one, possibly with characters added since, so `fromDraft` was
  true and recovery never ran. It shipped and the editor still came up empty.
  An empty parts library has nothing to lose, which is what makes adopting the
  manifest safe to do unprompted; the part count is re-checked when the fetch
  RESOLVES, and any characters already on board are kept over the manifest's.

  **The manifest is now autosaved.** The sharp edge underneath all of this was
  that saving a PART wrote its PNG but only added it to the in-memory model —
  only the Model tab's Save wrote the manifest — so a long session left the
  durable copy stale. That is exactly how a project with 16 parts on disk had 3
  in its manifest. `AaCharAdmin` now POSTs `save-project` about a second after
  ANY change (parts, characters, proportions, colours), debounced because the
  proportion inputs and appearance sliders fire per tick, sequence-guarded so a
  late reply can't report a stale outcome, and **skipped while the library is
  empty**. A badge in the header shows the state on every tab, so the durable
  copy's freshness stopped being something to remember to check.

  **And the endpoint enforces it, not just the editor** (`saveProject` in
  `scripts/vite-aachar-plugin.ts`): a write that would replace a populated
  manifest with an EMPTY one is **rejected**, and any write that shrinks the
  library copies the old manifest to `manifest.prev.json` first. Those guards
  live server-side deliberately — this is the last point before real art stops
  being reachable, and "the editor won't do that any more" is a weaker promise
  than "the endpoint won't accept it". Five tests cover them.

  ⚠️ What autosave still does NOT protect: the manifest lives in
  `public/aachar/`, so it dies with the folder. **Export JSON is the only copy
  that survives that**, and nothing automates it.

- **I8 — Test cleanups deleted `public/aachar/`.** Verification runs used
  `rm -rf public/aachar` to tidy up after POSTing test parts, which is the same
  directory real authored art lives in. Authored parts survived only because
  the last such cleanup happened to precede the first real save. Scope cleanups
  to the specific files a test created; never the directory.
- **I12 — The Body tab only reaches the FIRST body part.** BodyEditor resolves
  `partsInSlot(model, "body")[0]` with no picker, so a second body part would
  exist but be uneditable in the UI. This is why the zombie set (Phase 14)
  deliberately has no body variant — zombie skin is the `skin` colour channel
  instead. If a body variant is ever wanted (wounds, exposed bone), port the
  Slots tab's part picker to BodyEditor first.

---

## 6. Decisions log

*(non-obvious choices made during implementation — append with dates)*

- **2026-07-31 (manifest concurrency)** — **The editor is no longer the sole
  writer of the manifest; every save is hash-guarded and every mount
  reconciles with disk.** Scripts, hand edits and agents write
  `public/aachar/manifest.json` directly, and the editor's
  localStorage-draft-plus-autosave used to erase those edits wholesale (the
  "manifest clobber" — it bit three times in one day authoring `eyes`
  marks). Now: `save-project` carries `baseHash` (sha-256 of the manifest
  text this browser last synced, kept under `aachar-manifest-sync-v1` with
  the text itself as the merge base); a mismatch is a 409, never an
  overwrite; the editor then 3-way-merges disk into its draft
  (`lib/aachar/projectMerge.ts` — entity-level: part / character / outfit /
  model-rest; draft wins both-changed entities and flashes them; disk wins
  when there is no base yet) and retries once. Mount does the same
  reconcile, replacing the old "adopt disk only when the draft has no
  parts" recovery (that rule is a degenerate case of the merge). Legacy
  hash-less saves still land but always copy the old manifest to
  `manifest.prev.json` first. Merge granularity is the ENTITY, not the
  field, on purpose: field-level merging inside a part is ambiguity nobody
  can review, and an entity conflict names something a human can re-check
  in seconds.

- **2026-07-30 (Phase 14)** — **The Randomize filter persists the INCLUDED
  tag set, not the excluded one.** Storing exclusions would make a tag
  authored next month default to included (it isn't in the stored list),
  which inverts the feature's whole promise. Storing inclusions makes
  exclude-by-default the natural state of anything unseen, with no migration.
- **2026-07-30 (Phase 14)** — **An emptied Randomize pool keeps the slot's
  current selection instead of stripping it.** Excluding "zombie" while a
  zombie is selected must not undress the character's identity slots — and a
  body slot with zero eligible parts would otherwise remove the body outright.
  The kept slot also skips the resting-eye-state reroll (`keptByFilter`).
- **2026-07-30 (Phase 14)** — **Torn cloth shows skin through its holes for
  free.** The cloth renders over the body, so a punched-transparent pixel IS
  a wound window that follows any skin recolour — no wound colours to keep in
  sync. This is also why wounds didn't need a body variant (see I12).

- **2026-07-30 (Phase 5f)** — **Hat-hair is a per-character CHOICE, not a
  rule.** The always-on mask kept being wrong for somebody: side wings read as
  a bug under a beanie and as the whole look under a sun hat. Seven modes
  (`AA_HAT_HAIR_MODES`), default `"none"`, picked next to the Wearing table
  and stored on the character (and on outfits — it's part of the look).
- **2026-07-30 (Phase 5f)** — **Baked pixels, not a renderer clip.** The spill
  modes ADD pixels (puff, outline, shadow), which `clip-path` cannot express,
  so hat-hair became an atlas rewrite like the recolour pass — and
  `SpumCharacter.hairCropProfile` was deleted outright, returning the SPUM
  renderer to byte-identical-by-construction. Order is recolour-then-bake:
  spill samples the hair's post-recolour colours, while the helmet contributes
  only alpha and stays raw.
- **2026-07-30 (Phase 5f)** — **The spill puff paints in the hair's FILL
  colour, outlined in the hair's own darkest opaque colour** — not hardcoded
  black, and not the hem pixel blindly (that's usually outline, and a
  black-on-black puff is invisible). Per column: first surviving pixel below
  the hem that isn't the line colour, scanning at most 4 logical px down.

- **2026-07-29 (Phase 6d)** — **This character sleeps FACE-DOWN.** SPUM's
  `death_sleep` tips onto its back; a round blob has no readable on-its-back
  silhouette (the torso is a circle either way), while a face-plant — body
  +72°, hat-first, legs trailed out behind — reads instantly and suits the
  character. `SLEEP_POSE` in `clips/floor.ts` is the single source of truth:
  `death_sleep` ends on it, `sleep_idle` breathes over it as its `rest`, and
  `getup` is `reverseClip(death_sleep)`, so the three cannot disagree.
- **2026-07-29 (Phase 6d)** — **Floor poses must lay the stick legs ALONG the
  floor, not at the angle that feels "relaxed" numerically.** The first cut
  of `SLEEP_POSE`/`sit_idle` used ±35–55° of foot and the pose strip showed
  the legs spiking diagonally through the ground — this character's foot
  regions are drawn as full stick legs, so anything short of near-horizontal
  (±63–82°) reads as impalement. Caught by LOOKING, again; no test sees it.
- **2026-07-29 (Phase 6d)** — **`attack_magic` is a SCOOP, not a raise.** The
  first cut raised the hand straight to overhead and released — and measured
  0.30 against the originality gate, exactly at threshold, because
  raise-hold-release is also SPUM's shape. The scoop (hand sweeps back-LOW,
  then whips overhead, then thrusts) is the rig's own arc, reads better on a
  round body, and clears the gate with margin. When a gate failure is this
  marginal, the answer is a different structure, not nudged numbers — nudging
  is precisely what the gate exists to catch.
- **2026-07-29 (Phase 6d, playtest)** — **The head's own deltas must settle
  INTO the torso (−y) and nod WITH the body, never lift out or counter-shear.**
  The head bone is a child of P_Body, so body motion already carries it
  rigidly; any own-delta is RELATIVE on top. `sit_idle` shipped with head
  `y:+0.2` against the body's rise plus a −1.5° counter-rotation, and the
  neck opened on every breath ("his head comes apart"). `idle` had it right
  all along — its head y is negative on the exhale. Rule for any slow loop:
  head own-y ≤ 0, head rot same sign as body's and smaller.
- **2026-07-29 (Phase 6d)** — **`long_spear_walk` is derived from `move`**
  (`holdChannels` + a march `rest`), same rule as the carries — and
  `SPEAR_GRIP` is shared with `long_spear_idle` so stopping doesn't move the
  weapon. The reference leans its ROOT +8° for the whole walk; on this rig a
  root lean tips the feet and the hair with it, so the march press lives in
  body/head rest instead.

- **2026-07-29 (Phase 6b)** — **Authoring budgets come from painted-extent
  levers, not from any reference clip.** `rig.ts` scans each worn part's PNG
  alpha for the art's real bounding box, measures its distance from each
  channel's bone, and inverts "how far should the tip move" into degrees. On
  this character the same visual intensity is 9° of body and 40° of foot;
  copying ANY other rig's amplitudes produces nonsense by construction, which
  is what the first clip library demonstrated.
- **2026-07-29 (Phase 6b)** — **Rig facts were established by probe clips, not
  by reading code.** Single-channel clips (one value, held) rendered through
  the real renderer, slice movement measured off bounding rects. Two facts
  code-reading had already gotten wrong: the foot rot/pos coupling (the
  broken-ankle bug), and which head rider is the longest lever (hair, not the
  helmet). The sign table in `rig.ts`'s header is measurement, and
  `rig.test.ts` pins it.
- **2026-07-29 (Phase 6c)** — **The originality gate compares the JOINT
  rot+x+y curve per channel against a best-fit SCALAR of SPUM's.** Rotation
  correlation alone cannot distinguish a traced walk from an original one
  (every walk's foot-rot is a triangle wave), but a single scalar cannot fit
  rot and travel simultaneously unless the rot:pos ratios were copied — which
  is what tracing copies and independent authoring doesn't. Threshold 0.3;
  the traced library measured < 0.1 on ten channels.
- **2026-07-29 (Phase 6c)** — **Impact = displacement over a held stagger,
  never a root rotation.** A blob with buried feet has no visible leg line to
  sell a 30° tip, and the hair lever turns it into flying headgear. The lunge
  and knockback are `root.x`; the feet set a wide stance first and HOLD it
  through the strike. The one deliberate lever whip is `damaged`'s head.
- **2026-07-29 (Phase 6c)** — **Walk contacts SPLIT the feet; passes gather
  them.** The first re-authoring attempt converged both feet toward the centre
  at contacts and they crossed into an X — caught by LOOKING at the pose
  strip, not by any test. Each foot travels ~10px per half-cycle; only the
  swinging foot lifts. The strip harness (each authored beat held, A/B against
  SPUM on the real character) is the mandatory review step for clip work now —
  the first library shipped broken precisely because this step was skipped.
- **2026-07-29 (Phase 6c)** — **`greeting2`'s hop is `root.y`** — the feet are
  children of Root, so lifting the root takes the whole character; lifting the
  body alone hoists the torso off its own legs. Verified by probe before use.

- **2026-07-28** — Seam is `resolvePart(slot, part) → atlas URL`, not a full
  sprite-source object. Slices take their PNG from `atlas.image`, so resolving
  the atlas is sufficient and keeps the prop surface minimal.
- **2026-07-28** — Reuse SPUM bone paths as a subset (D2) rather than authoring
  a new skeleton, because clip/bone lookup is by path and tolerates both
  missing bones and extra tracks. Preserves the entire scene pipeline for free.
- **2026-07-28** — A blank model seeds a **procedural placeholder mannequin**
  from its own geometry rather than rendering an empty rig, so "nothing drawn
  yet" is visually distinguishable from "plumbing broken", and geometry changes
  are legible before any art exists.
- **2026-07-28** — Manifest stores atlases inline (with `image` as a
  `/aachar/...` URL, not a data URL), so it stays small and one fetch yields a
  whole project. This is why `resolvePart` went unused — revisit if the
  manifest ever needs lazy per-part loading.
- **2026-07-28 (refactor)** — Split `AaCharacter` into `AaModel` + `AaCharacter`
  under an `AaProject` (D10). The original shape filed art under a character
  name, which was backwards: you draw *a body*, not one person's body. Part
  paths moved from `parts/<Character>/` to `parts/<slot>/`.
- **2026-07-28 (refactor)** — Chose staleness detection (`authoredFor` +
  `isPartStale`) over supporting multiple geometries. With one canonical torso
  (D11) the "which body is this cloth for" problem disappears; what remains is
  that geometry moves *during* exploration, which is a detection problem, not a
  modelling one.
- **2026-07-28 (refactor)** — Model carries base proportions, characters carry
  a per-bone delta (D12), merged by path. Overriding a bone takes both its axes
  — per-axis merging would make "reset this bone" ambiguous.
- **2026-07-28 (Phase 3)** — Re-pack migration aligns on each region's
  **pivot**, not its top-left. The pivot is what the renderer pins to the bone,
  so a resized sprite grows or crops around the point that actually matters
  instead of drifting off its anchor.
- **2026-07-28 (Phase 3)** — Flood fill is clipped to the clicked region
  because the packer deliberately leaves no gutter between regions; the
  alternative (padding the sheet) wastes texture and complicates the atlas.
- **2026-07-28 (Phase 3)** — Geometry edits are staged in the editor and
  committed to the model explicitly. Syncing on every keystroke would mark
  every saved part stale mid-typing.
- **2026-07-28 (Phase 3)** — The model stores each part's canonical
  `/aachar/...` URL while the editor previews from a data URL. Keeps the
  manifest small (D5) without making the live preview wait on a disk write.
- **2026-07-28 (Phase 3b)** — **Sheet re-laid out to read like the character**
  for a squat/wide torso: Head over Body over Foot_R+Foot_L, all centred on one
  vertical axis so those three are drawn *in place*; both arms parked on their
  own row underneath. An arm beside the torso caps it at
  `sheetWidth - 2*arm.width`, which is backwards when the torso is the region
  that wants to grow — now the torso owns its row and the sheet widens with it.
  Region coordinates are arbitrary to the renderer (slices by rect, places by
  pivot), so the layout is free. Stock geometry goes 30×32 → 24×39.
- **2026-07-28 (Phase 3c, bug fixes)** — Three defects found in first real use:
  1. **`size` on `SpumCharacter` is an apparent-size MULTIPLIER (1 = base), not
     a pixel height.** The preview passed `size={320}`, rendering the rig at
     ~53× the intended scale, entirely outside its clipped container — hence an
     empty grey box. Now a slider defaulting to 6, matching the Part Studio.
  2. **`SpumCharacter` renders upward from a zero-size root**, so it needs an
     explicit anchor near the bottom of its container (`absolute`, left 50%,
     top 88% — the Part Studio's pattern). Centring it in a flex box put the
     feet mid-container and the body off the top.
  3. **The working pixel buffer lived only in the editor's ref**, so switching
     tabs unmounted it and threw away the drawing. Fixed on three levels: the
     editor now stays **mounted** (hidden) across tab switches; it **hydrates
     from the saved part** on mount, through `migratePixels`, so reopening also
     repairs a stale part; and saving an empty canvas over an existing part
     **asks first**. Any one of these alone would have left a data-loss path.
- **2026-07-28 (Phase 3d)** — Hydration claimed its guard token BEFORE the
  async image load. **StrictMode invokes effects twice in dev**, so run #1
  claimed the token and was then cancelled, and run #2 saw the token and bailed
  — the canvas never hydrated, and a saved part could not be reopened. The
  token is now claimed on success. Worth remembering for any
  claim-then-await effect in this codebase.
- **2026-07-28 (Phase 4e2)** — **Rotation handle on the selection.** A knob off
  the selection's right edge (flipped left when the sheet edge is in the way),
  tethered to a dot at the centre it turns about. Drag it to rotate, Shift snaps
  to 15°, `[` / `]` step by one snap without going near the handle. Three things
  are worth remembering:
  - **The rotation source is sticky.** Nearest-neighbour is the only resampling
    a pixel editor may do, and chaining it destroys a 20px sprite in three
    drags. So a *session* holds the pixels as first lifted plus a cumulative
    angle: every drag re-rotates the ORIGINAL, so 30° → 60° → 0° comes back
    exactly. A move carries the session's centre along; a new marquee, undo,
    redo, Esc or a tool change drops it.
  - **The centre is kept fractional** and never re-derived from the rect. The
    rotated bounding box grows, so the rect changes size every frame; rounding
    it back into the centre would walk the art off its own axis over a long
    drag.
  - **`clearRect` now takes bounds.** A rotated box can hang over the region
    edge, and the unclipped clear that the move drag used would have erased the
    neighbouring sprite — or, past the sheet's right edge, wrapped onto the next
    row. Both lifts pass the region now.
- **2026-07-28 (Phase 4e)** — **Marquee select + move.** Drag a box, then drag
  inside it to move those pixels (arrow keys nudge 1px, Esc drops it). Each
  mousemove recomposites from a *lifted base* — the buffer with the selection
  cleared, plus the floating pixels stamped at the current offset — rather than
  blitting incrementally, so dragging back and forth is pixel-exact instead of
  accumulating error. Transparent pixels in the floating buffer are skipped, so
  a move composites over its destination instead of punching a hole. Selections
  are clipped to the region they were made in, same rule as fill and shapes.
- **2026-07-28 (Phase 4d)** — **Every sheet now carries a 1px transparent
  gutter** (`REGION_GUTTER`) around and between regions. Slices render as a
  region-sized box with the WHOLE sheet as `backgroundImage`, offset by
  `backgroundPosition`, then scaled by a **fractional** factor
  (`outerRemainderScale` ≈ 0.982 at size 1) — so box edges land on fractional
  device pixels and the browser samples one texel past the boundary. Packed
  edge-to-edge, that texel is the neighbouring sprite: a stray line of head
  across the shoulder, of torso across the leg. SPUM's own sheets are adjacent
  too, but their art carries transparent margins inside each region, so their
  bleed is invisible; art drawn to the region edge — which this editor
  encourages, since the region *is* the sprite — has no such luck. The eye
  sheet is laid out locally rather than via `makeFreeEyeSheet` so its two bands
  get the gutter as well. Pinned by an invariant test over several geometries,
  not just the numbers of one layout.
- **2026-07-28 (Phase 4c)** — **The head/body seam is a proportion consequence,
  not a bug, and the editor now measures it.** The head and body sprites are
  adjacent on the SHEET but placed by separate bones on the RIG, so sheet
  adjacency says nothing about whether they meet. The skeleton fixes the head
  sprite's centre 10.5px above the body's; SPUM's 15px-tall head therefore
  overlaps a 10px torso by 2px and a gap is impossible. Shorten the head to
  10px and the same bones yield a 0.5px **gap**. `headBodySeamPx` reports it
  live in the Proportions panel, so the failure mode is visible instead of
  being discovered on the rig. Proportion controls were pulled forward from
  Phase 5 because without them there was no way to fix it.
- **2026-07-28 (Phase 4b)** — **Draw order is a model property** (`zOrder`,
  bone path → `sortingOrder`), applied through the existing `skeletonOverride`
  seam — the renderer reads z straight off `bone.sortingOrder`, so no renderer
  change was needed. Unlike `defaultPos` these need no animated-bone guard:
  clips carry rot/pos/visibility tracks, never draw order.
  **AA's default departs from SPUM's:** SPUM stacks both feet behind the body
  (−3, −12) while the left arm is in front (+20). That asymmetry works on their
  small chibi torso, which barely overlaps the feet; on a wide round torso the
  near leg vanishes behind it, so the left foot defaults to +1. `effectiveZOrder`
  layers the model's own overrides on top, so a project saved before `zOrder`
  existed still picks up the AA default instead of silently reverting.
- **2026-07-28 (Phase 4)** — The eye slot uses SPUM's **free-eye layer**
  (`lib/spum/freeEye.ts`) rather than the stock two-bone stamping. Stock SPUM
  draws a 1×3 sliver twice at a hardcoded 5px spacing; on an original head with
  different proportions that is unusable. The free layer renders once and the
  author places both eyes by hand.
- **2026-07-28 (Phase 6)** — **A beat's pose is a DELTA, not an absolute.** The
  engine stores absolutes, which is why editing SPUM's clips means touching
  every keyframe of every bone to change one thing. With deltas over
  stance+rest, amplitude scaling is a multiply, posture bias is an add, and
  asymmetry is a reflection — the entire variant grammar falls out of the
  representation instead of needing a transform per knob.
- **2026-07-28 (Phase 6)** — **A beat is a WHOLE-BODY pose: a channel omitted
  from a beat sits at stance+rest there, it does not coast.** This is what the
  engine's clips already are (three quarters of animated bones key at every
  pose time), and the alternative — omission means "keep interpolating" — makes
  a clip's meaning depend on which neighbours happen to exist, so inserting a
  beat would silently change poses elsewhere.
- **2026-07-28 (Phase 6)** — **A track is emitted only if it is non-zero
  somewhere.** A clip that says nothing about a bone's position leaves its
  `defaultPos` live, which is the entire proportion system. The corollary is the
  channel table must avoid proportion bones outright — enforced by a
  module-load throw, because the failure mode is a slider that silently stops
  working rather than anything visible.
- **2026-07-28 (Phase 6, corrected same day)** — **The stance is the RIG'S
  NEUTRAL — each channel bone's own `defaultPos` — not something derived.**
  The first version invented one from geometry (arms and head at (0,0)) on the
  theory that SPUM's ±1.5px offsets were art nudges the proportion bones should
  own. Wrong, and only a real character showed it: `defaultPos` is what a bone
  falls back to when no clip positions it, so **every proportion control in the
  editor was dialled in against exactly those numbers**. This model's `HeadSet`
  had been lowered to 3.5px specifically to close the head/body seam against
  them; zeroing the head stance raised it 0.5px (a visible gap at the neck) and
  pushed it 1.5px right of the torso. Measured in the browser: AA seam +0.50px
  vs SPUM's 0.00px, head x-offset +1.0px vs −0.5px. Now both read identically.
  The geometry-derived version survives as `fittedStance` behind a button,
  because it genuinely helps a NEW model — but applying it moves an existing
  character, which is the user's call, not a default. **General lesson: Phase 6
  replaces MOTION; where the parts sit at rest is the skeleton's business.**
- **2026-07-28 (Phase 6)** — **Coverage, not completeness, with a fall-through.**
  Authoring 38 clips before shipping any would be weeks for a distribution where
  two clips are 56% of use. An unauthored name returns null from
  `compiledAaClip`, which `clipOverride` already reads as "fetch SPUM's" — so
  the library can grow one clip at a time with nothing broken in between, and
  the editor labels which layer answered so "still SPUM's motion" is visible
  rather than something you have to remember.
- **2026-07-28 (Phase 6)** — **Derived clips are functions.**
  `lib/spum/catalog.ts` documents five hand-authored derivatives and warns they
  desync if a parent is regenerated. Expressing them as `reverseClip` /
  `concatClips` / `holdChannels` / `rampChannels` makes the desync impossible
  rather than documented.
- **2026-07-28 (Phase 6)** — **`retimeBeats` declines rather than dropping a
  pose.** Rounding a power-curve retime back onto the integer grid can collide
  two beats; a variant that silently deletes an authored pose is worse than one
  that returns the original timing.
- **2026-07-28 (Phase 6)** — **Preview size is FITTED, not fixed.** Phase 3c
  recorded that `size` is a multiplier and set 6 to match the Part Studio, but
  the base is 6.875 CSS px per source pixel, so 6 renders a 32px character
  ~1300px tall into a 420px box. It went unnoticed because the body/slots tabs
  are really canvas workflows where the rig is a sanity check. `fitSize` derives
  the multiplier from geometry; the slider became a zoom around it. Worth
  remembering: an editor's preview being wrong is invisible until something
  depends on judging it.
- **2026-07-28 (Phase 6)** — **Recorded sharedness was overstated at ~90%.** The
  original pass counted only channels present at every pose time, which selects
  for the answer; measured over all animated bones it is 0.75. The structural
  conclusion is unchanged, and it is now a test rather than a paragraph.
- **2026-07-28 (Phase 3b)** — Shape tools **reuse `lib/spum/shapeTools.ts`**
  rather than duplicating it, re-exported through `lib/aachar/shapes.ts` so the
  dependency has one site. It is pure geometry (no canvas, React, or catalog)
  and already tested on the awkward cases — flat ellipses, 1px shapes, inverted
  drags. The isolation rule (D1) exists to stop coupling to SPUM's catalog, art
  and save path; copying a tested pure function would serve its letter and hurt
  its point. `rectPixels` is new — the Part Studio only ever needed ellipses.
- **2026-07-28 (Phase 5c)** — Headroom is stored as an **offset from centre**,
  not as an absolute pivot, so `0` means "the stock centre pivot" and produces
  **no pivot entry at all**. Parts saved before headroom existed therefore read
  back as headroom 0 rather than as some rounded fraction, and the atlas of a
  part that doesn't need it is byte-identical to what it was.
- **2026-07-28 (Phase 5c)** — A floating import is **re-rendered from the
  decoded original** at every scale, never resampled from the previous render.
  The alternative (scale the already-fitted buffer) compounds the exact damage
  the SVG path exists to avoid, and would make the final quality depend on which
  order the slider was dragged in.
- **2026-07-28 (Phase 5d)** — The hair mask is a **renderer clip**, not a baked
  atlas. Erasing the pixels would mean re-encoding a PNG per character (hair is
  shared across characters, only some of whom wear a helmet), and the crop is
  one number that the CSS transform already scales correctly. It went into
  `SpumCharacter` rather than the AA layer because the slice DOM is the only
  place that can express it — but as an opt-in prop, so SPUM's own rigs render
  byte-identically.
- **2026-07-28 (Phase 5d)** — Mask against the helmet's **art**, not its region.
  `contentProfile` is recorded on save (helmet slot only — a profile per region
  on every part would bloat the manifest for nothing); deriving it at play time
  would mean decoding the PNG in the renderer, and deriving it from the region
  rect would put the mask in the empty air above the crown.
- **2026-07-28 (Phase 5d, correction)** — The mask is per-column, not one cut
  line. Shipped as a scalar first and it did nothing on a real character: a hat
  is a dome, so the columns that need cutting are the ones AWAY from the crown,
  and the crown itself already clears the hair. Verified the replacement by
  running the real PNGs through `hairMaskProfile` rather than by eye.
- **2026-07-29 (Phase 5d, correction 2)** — The mask cuts at the helmet's
  **bottom edge**, not its top profile. The top profile assumes the hat is
  solid beneath its outline, which the jester hat's drooping prongs are not —
  hair leaked through the air under them while the mask correctly computed
  zero. Bottom-edge is safe because the helmet already paints over hair
  (z 11/12 vs 6), so the only pixels the deeper cut removes that the hat
  doesn't cover are exactly the notch leaks. `contentBottomProfile` supersedes
  `contentProfile` on `AaPart` (kept as a typed legacy field, never read);
  the top-profile helpers were replaced, not kept alongside — nothing consumed
  them, and two near-identical profile conventions is how the next leak gets
  written.
- **2026-07-28 (Phase 5d)** — Median cut kept as the `coverage` default and
  `distinct` added alongside, rather than replacing it. They answer different
  questions ("reproduce this image with N inks" vs "which N colours ARE this
  image"), and the Part Studio's import has been tuned against the old
  behaviour.
- **2026-07-28 (Phase 5c)** — The draft takes a mousedown only **inside its own
  rect**; anywhere else still paints. Grabbing every click while an import is in
  flight would have made the tools feel broken, and the import is often a
  reference to draw over rather than the finished art.
- **2026-07-29 (placement)** — **Per-slot placement (nudge x/y, rotate, flip)
  lives on the CHARACTER (`AaCharacter.placement`), keyed by SLOT, and reaches
  the renderer through a new `slotAdjustments` seam on `SpumCharacter`** —
  not through `partAdjustments`, whose `adjustmentKey` folds weapon2 into
  weapon and would make "item L" and "item R" share one placement. The seam
  composes onto the part-level adjustment (offsets add, scales multiply,
  rotations add, flips cancel), so it's additive for every SPUM consumer.
  Render mechanics: `rotate` sits between the bone's world transform and the
  slice's pivot scale, so it spins the art about its own anchor "naturally"
  (no deconstruction, and the clip keeps animating under it); `flipX` is a
  negative x on the pivot-anchored scale, with the dx pivot-fold negated
  under a flip so +x always means screen-right. dx/dy stay in the sprite's
  own frame (they rotate with `rot` and with the bone), matching the existing
  `PartNudge` convention. Identity placements are deleted rather than stored,
  same rule as appearance.
- **2026-07-29 (Phase 10)** — **Applying an outfit REPLACES the look
  wholesale; it never layers.** The alternative (merge over the current look)
  makes an outfit's meaning depend on what the character happened to be
  wearing — the same trap as coasting beats in Phase 6, resolved the same
  way: an outfit is a whole-look statement, and a slot it doesn't name is
  emptied. The skeleton is excluded for the D12 reason (build ≠ outfit), and
  the same exclusion is why `wearsOutfit` can compare looks by serialization:
  two characters with different proportions can both be "wearing" the ninja
  outfit.

---

## 7. Session log

- **2026-08-04** — **Character-level resting gaze, per-eye (crazy eyes).**
  `AaCharacter.gaze` is an `AaGaze`: one of the 8 Phase-12 directions for
  both eyes, or a per-eye `{left?, right?}` pair (sides viewer-relative, an
  unset side stays as drawn) — cross-eyed, wall-eyed, derp, one-eye-drifts
  are all pairs. "As drawn" is deleted rather than stored and a uniform pair
  collapses to the single-direction form. Precedence: Slots pad preview →
  clip gaze → scene `gaze` action/initial → **character resting gaze** → art
  as drawn. Stored RIG-space, so it rides the facing mirror like the rest of
  the face (scene gaze stays screen-space and still unmirrors; clips and
  scene actions still speak single directions). Per-side resolution via
  `gazeFor`/`isIdentityGaze` in `lib/aachar/gaze.ts`; fallback applied in
  `bakeAaSceneLook` (scenes) and `AaCharAdmin`'s `activeGaze` (editor).
  Characters tab: "resting gaze" preset dropdown (8 both-eye looks + ~20
  crazy-eye presets) + independent left/right selects, always visible in the
  eye block, disabled until the worn eye part has Eyes & pupils marks.
  Validated in `validateCharacter` (both forms). The pair form also carries
  `gap` (0–8; a number for both eyes or `{left?, right?}` per side — UI is a
  "1px gap" checkbox on each eye row): the clamp backs that pupil off that
  many pixels from its furthest-the-whites-allow offset, because a flush
  pupil reads as merged with the eye's outline on some art (worst on
  diagonals). Resolution via `gazeGapFor` in `lib/aachar/gaze.ts`. A pair
  side can also be a MANUAL pupil offset `{dx?, dy?}` (±32, placement
  convention +dx right/+dy up, "pupil x/y" inputs on each eye row): the
  pupil walks the straight line toward the target and stops at the last
  step that keeps every pupil pixel on the whites (`clampGazeOffset`), so
  exact placement still can't escape the eyeball. Gap applies to direction
  sides only; a manual offset owns its exact spot.

- **2026-08-04** — **Scene editor authors AA actors.** The Phase-7 "compact
  read-only row + edit the `aachar` field by hand" stopgap in
  `SpumSceneEditor` is gone: a "+ AA actor" button (primary, next to the
  demoted "+ SPUM actor") casts a character seeded from the roster, and the
  AA row now has a character picker (names via `loadAaSceneBundle()` — same
  session-cached manifest fetch the renderer uses; unknown names stay listed
  so scenes round-trip), per-slot `hide` toggles, an initial-gaze select
  (resting + 8 directions), and an animation list filtered through
  `BANNED_CLIPS` (no more authoring `move_carry`/`attack_magic` slides).
  Rendering was already fine (SpumScene → AaSceneCharacter); this was purely
  the authoring gap.

- **2026-07-31** — **Manifest clobber fixed for real.** Scene-side gaze work
  kept authoring `eyes` marks into the manifest and the editor kept erasing
  them (localStorage draft + debounced autosave never re-read disk; closing
  the tab didn't help because the stale draft came back on the next visit).
  Shipped optimistic concurrency end to end: `baseHash` guard + 409 on
  `save-project` (backup on every legacy unguarded save),
  `lib/aachar/projectMerge.ts` 3-way entity merge with unit tests, editor
  mount reconcile + conflict-merge-retry on both manual save and autosave,
  flash messages naming merged/conflicted entities. See Decisions log
  (2026-07-31) for the shape and the granularity rationale.

- **2026-07-28** — Measured the rig (38 clips, 71 bones); established the
  never-animated proportion knobs and the absolute-position override behaviour.
  Wrote this plan. **Phases 1 and 2 shipped**, then refactored Phase 2 to the
  model/character split before any art existed (cheap now, a data migration
  later). **Phase 3 shipped** the same day: the body editor, with resizable
  regions, pivot-aligned pixel migration, pivot-to-pivot onion skin, and live
  rig preview. Then **Phase 3b** on playtest feedback: the body plan is a
  squat, wide, round torso, so the sheet was re-laid out to read like the
  character (head/torso/feet in place on one axis, arms parked below) and
  rect/ellipse/circle tools were added. Then **Phase 3c** fixed three defects
  found in first real use — a broken rig preview (wrong `size` semantics + bad
  anchoring) and a data-loss path where switching tabs discarded the canvas.
  Then **Phase 3d** fixed hydration outright (a StrictMode double-invoke made
  saved parts impossible to reopen), and **Phase 4** shipped: the canvas was
  extracted into `PartCanvas` and the Slots tab built on it, so eyes can be
  drawn while the torso is still being judged. **Phase 4b** added model-level
  draw-order overrides with a Layering control, defaulting the left foot in
  front of the body (SPUM's stacking assumes a chibi torso). **Phase 4c**
  diagnosed a head/body seam as a proportion consequence (a shorter head turns
  SPUM's built-in 2px overlap into a gap), added `headBodySeamPx` as a live
  readout, and pulled the base-build proportion controls forward from Phase 5
  since there was otherwise no way to fix it. **Phase 4d** traced stray lines
  on the rig to texture bleed at region boundaries and added a 1px gutter to
  every sheet. **Phase 4e** added marquee select + move, and **4e2** a rotation
  handle on that selection. **Phase 5** shipped
  per-part editing (a second part in a slot was previously unreachable) and the
  Characters tab, then PNG/SVG import into any region. 130 aachar tests; full
  suite 1201 green; tsc + lint clean.
  First real character saved and verified: body + eyes + hair, manifest and
  bundle both validated.

- **2026-07-28 (Phase 6)** — **Animation shipped.** Re-measured the 38 clips
  first (durations, pose-key structure, per-bone amplitudes, off-grid keys,
  usage counts across `content/`) and turned every one of those measurements
  into a test, so the numbers in this doc now fail a build instead of going
  stale — which is how the recorded ~90% sharedness figure was caught as
  overstated (it is 0.75) and the usage counts were refreshed.

  Then built the format (beat sheets over seven channels, three authoring
  layers, deltas not absolutes), the compiler, the derivation ops, the variant
  grammar, the structural analyser, and **13 original clips covering 86% of
  clip references in `content/`** — same durations as the engine's, provably no
  shared keyframe values. An unauthored clip falls through to SPUM's, so the
  library grows one clip at a time with nothing broken between.

  The editor gained an **Animation tab**: A/B against the engine's clip,
  pose-key reference view with the three-position overlay, an 11-tile variant
  grid, per-beat numeric editing with loop endpoints tied together, "Copy TS" to
  promote a tuned clip back into the library, and a live coverage readout.

  One defect fixed along the way that was not in scope but blocked the work:
  **every rig preview in this editor was drawn at roughly 4× its container**
  (`size` is a 6.875 px/px multiplier, and Phase 3c's default of 6 assumed
  otherwise). Fine for a canvas workflow, fatal for judging motion. Now fitted
  from geometry with the slider as a zoom.

  61 new tests (177 in `lib/aachar/`), full suite 1262 green, tsc + lint clean,
  verified in a real browser with headless Chromium — every view renders, all 11
  variant tiles animate, clip switching works, and the SPUM fall-through plays.

  **Then playtest caught a real defect and it was fixed the same session:** the
  head sat half a pixel above the torso and 1.5px right of centre, leaving a
  visible seam at the neck. Cause was the invented stance (see the decisions
  log) discarding the rig's own rest pose, which this character's `HeadSet`
  tuning had been measured against. Diagnosed by measuring the rendered sprite
  rectangles in both preview panes — AA seam +0.50px against SPUM's 0.00px —
  rather than by eye. The stance now defaults to the rig's neutral (pinned to
  `skeleton.json` by test), the geometry-derived version moved behind a button,
  and the Animation tab gained a **Stance panel** with a live neck-seam
  readout. Re-measured after: both panes identical.

  Next: **Phase 7, content integration** — the only thing left between this
  pipeline and a character on screen in a lesson.

- **2026-07-28 (Phase 5c)** — Two authoring asks from drawing face art, both
  shipped: **headroom** on the head-worn slots (the canvas was centred on the
  head, so half of every added row went under the chin) and a **live import
  transform** (scale + drag + place, re-rendered from the decoded original at
  every size). `migratePixels` now takes separate from/to pivots so a moving
  anchor keeps art pinned to the head. Then playtest immediately caught the
  half-fix: the control was right but the **default canvas** was still 25×20 on
  a 10px head, so a new hair part had 5px above the skull and the feature read
  as missing. Defaults raised, `DEFAULT_HEADROOM` added, and a one-click
  **Room for tall hair** preset. 8 new tests (185 in `lib/aachar/`), full suite
  1270 green, tsc + lint clean. ⚠️ Not click-tested in a browser — both
  surfaces need canvas + File, so verify at `/admin/aachar` → Slots.

- **2026-07-28 (Phase 5d)** — Two more from the same authoring session: **hair
  is now masked to the helmet's outline** instead of poking through it (a
  renderer clip driven by `lib/aachar/mask.ts`, with `AaPart.contentProfile`
  recording the helmet's top profile), and the palette cap gained a **`distinct`
  mode** — farthest-point seeding + weighted Lloyd — because median cut spends
  its slots on the biggest area and had been dropping a small red highlight in
  favour of a third shade of brown. 12 new tests (194 in `lib/aachar/`), full
  suite 1282 green, tsc + lint clean.

  The mask went out wrong the first time — a single cut line, which computes to
  0 rows on a domed hat — and playtest caught it in one screenshot. Two errors
  compounded: the per-column shape was needed, and the pivot arithmetic was
  inverted (`pivot.y` counts from the region's bottom). Fixed and then
  **verified numerically against the real `AA_hair` / `AA_sunhat` PNGs**, since
  neither surface can be unit-tested through a browser. That check is the thing
  that should have happened before the first attempt shipped.

  A third pass followed the same way: a few pixels still escaped at the top-left,
  because the two sprites' columns are half a pixel out (25-wide hair, 32-wide
  hat) and rounding picked the column further up the dome. Each hair column now
  masks against the union of the helmet columns it overlaps.

- **2026-07-28 (Phase 5e)** — **Recolouring is a palette swap on the part's own
  PNG, not a tint.** The alternative already existed — SPUM's per-slot
  `feColorMatrix` multiply — and was rejected on two counts: it darkens the
  outline along with the target, and one slice can only carry one colour, which
  makes a two-colour shirt impossible. Swapping tagged palette entries instead
  costs one canvas pass per (part, colour set), reaches the renderer through
  `atlas.image` with no renderer change at all, and leaves every untagged
  colour alone by construction.

- **2026-07-28 (Phase 5e)** — **Tags name real authored colours; nothing is
  drawn in a sentinel colour.** A white-keyed area has to be flat, so it loses
  the ramp, and it makes the sprite unreadable while you draw it. Tagging is
  also palette-keyed rather than region-keyed, which is why one tag covers
  cloth's torso and both sleeves without saying so.

- **2026-07-28 (Phase 5e)** — **Appearance is a per-pixel pass, not
  `appearancePerSlot`'s CSS filter.** The filter version already exists in
  `lib/spum` and is much cheaper, but it applies to the whole slice and so
  hue-rotates the outline along with the fill — which is precisely the thing
  that must not happen. Sharing the recolour's pass buys outline protection for
  both halves at once and costs one traversal of a sprite that is ~2000 pixels.
  Consequence to remember: appearance now needs a canvas decode, so it can't
  live in the synchronous `atlasOverrides` memo (hence the hook), and a decoded
  buffer cache is what keeps a slider drag from re-decoding the PNG per tick.

- **2026-07-28 (Phase 5e)** — **Outline protection defaults to a lightness
  THRESHOLD rather than requiring tags.** A tagged list is more precise and
  would have meant every existing part's outline broke the first time someone
  moved a slider. The threshold is tight enough (0.30 OKLab) to catch near-black
  and nothing else, the panel prints which colours it caught, and both a slider
  and click-to-pin are there for the cases it gets wrong.

- **2026-07-28 (Phase 5e)** — **`base` must be in its own `ramp`**. Every other
  entry's new colour is derived from where the base lands, so a base outside
  the ramp anchors the maths to a shade the sprite doesn't contain.
  `colorPicksFor` filters a character's picks to the channels the PICKED part
  declares, so retagging or re-picking leaves a stale id inert rather than
  recolouring something that no longer exists — and character validation
  deliberately does NOT check ids against parts, because an imported bundle
  applies its model and characters together.

  **Revised 2026-07-29: a dangling base is REPAIRED at validation, not
  rejected.** The editor itself could save the state (a fresh channel's
  placeholder black base survived tagging into a non-empty ramp), and rejecting
  it failed the localStorage draft, the manifest, AND the blank-boot recovery
  fetch at once — indistinguishable from total data loss, over one hex field
  the render path tolerates. `colorChannelError` now re-anchors the base to the
  first ramp entry (the same rule `toggleRampColor` applies on tag), and the
  Colour channels panel shows an amber badge while a saved part is still in
  that state.

  The fourth screenshot showed the hat floating clear above the head — not a
  mask fault at all, and the mask was correctly doing nothing. Measuring the
  bones found the real defect: **the onion skin had been lying in every
  head-worn slot since Phase 4**, drawing the reference head at the slot's own
  anchor when the head sprite hangs 2.5–5px away (`headOffsetFromSlotAnchorPx`).
  Art aligned against it rendered that far out. A floating import also centred
  on the region rect rather than the anchor, ~10px off on a headroom'd canvas.
  Both fixed; the mask now also computes from the atlases actually being
  rendered, so it tracks an in-progress canvas instead of the saved part.

- **2026-07-29 (Phase 6b/6c)** — **The clip library was re-authored from
  scratch after playtest showed it was both broken and derivative.** The user's
  report ("some of these don't even work") plus measurement told the full
  story: the first library's values were SPUM's nudged 3–7% (per-channel
  correlation 1.00 on `damaged`/`attack_melee`/`throw`, 87% of beat frames on
  their pose keys) AND it read as nonsense on the real character, because it
  was tuned for SPUM's proportions — crossed feet, arms slicing the face, the
  strike frame tipping the whole rig over.

  Fixed in the order the user prescribed: **learn the bones first.**
  `lib/aachar/rig.ts` (Phase 6b) measures the rig empirically — probe clips
  through the real renderer established the sign table (facing left, −x =
  forward, −rot swings a hanging limb forward), the hierarchy traps (feet ride
  Root, not the body; hair/eyes/hat all ride the head), painted-extent lever
  radii (hair 22px vs foot 6px — the same 30° moves 11px of hat and 1px of
  foot), amplitude budgets per intensity, silhouette burial (feet never clear
  the torso at stance → locomotion must be position-dominant), and the foot
  rot/pos coupling rule the first library had inverted. All pinned by
  `rig.test.ts`, which also replaced a failing orphan `_rigstudy.test.ts`
  another session had left.

  Then all 13 clips re-authored from budgets + grammar (Phase 6c): split-
  contact position-dominant walk, lopsided 9/11 reach-and-paw run, impact as
  root-displacement over a held stagger, `damaged`'s hair-whip as the one
  deliberate lever hit. An **originality gate** now runs in the suite: interior
  beats must sit off SPUM's pose keys, and no channel's joint rot+x+y curve
  may be a scalar multiple of SPUM's (the traced library measured <0.1; the
  new one clears 0.3 everywhere). Every clip was reviewed as a pose strip
  against SPUM on the real character — that review caught `move`'s first cut
  crossing its feet, the exact class of defect the skipped-look shipped last
  time. 1357 tests green (96 new), tsc + lint clean.

  Still open: the 14 unauthored clips still play SPUM's motion (fall-through
  by design); Phase 7 unchanged.

- **2026-07-29 (Phase 6c, playtest round 2)** — User verdict on the
  re-authored set: good, with tweaks. `move`, `givereceive` (and an `idle`
  that predates the re-authoring — flagged) now carry user-tuned overrides in
  the manifest. `throw` was the miss: it read as a poke, not a toss. The
  user's fix was better than a retune — **the poke became `stab`, the first
  AA-ORIGINAL clip name** (no SPUM counterpart: no duration lock, no
  fall-through, gate-exempt, listed in the picker, reference pane explains
  itself instead of 404ing). `throw` was then rebuilt by STUDYING the SPUM
  reference rather than copying it: theirs is an overhead windmill through
  the arm SOCKET (a bone this format deliberately doesn't animate) — what it
  teaches is that a throw is a long hand ARC + a body that counter-leans BACK
  at release + a head level on the target. The AA throw is an **underhand
  sling**: the arm channel sweeps +74 → −142 so linear interpolation carries
  the hand low-behind → down → forward-high through the hanging position,
  body slings back −13° at the locked f17 release, weight steps through on
  root.x. Verified by pose strip.

  Also fixed while here: **`retimeBeats` now pins contact-role beats** and
  retimes piecewise between them — beat-bias variants of hand-off clips were
  broken by construction (they moved `throw`'s release off f17). 266 aachar
  tests green; full suite green; tsc + lint clean.

- **2026-07-29 (Phase 6c, playtest round 3)** — Throw v2 wasn't a throw
  either: playtest read it precisely — body bottom-to-top, arm bottom-to-top,
  an UNDERHAND rise, while the SPUM reference is unmistakably OVERHAND. Two
  more keepers salvaged before the fix: **`uppercut`** (throw v2 verbatim —
  the rising punch it always was) and **`yay`** (the symmetric-variant tile
  playtest spotted in the grid: mirror the limb pairs and the uppercut
  becomes both-arms-up jubilation; derived via `applyVariant` so it stays a
  function of `uppercut`, impact beat re-roled to `extreme`). Then **throw
  v3, actually overhand**: the arm channel's rotation increases monotonically
  +25 → +150 → +240 → +268, so the hand travels back → up over the BACK →
  over the top → forward-down — the socket-windmill arc traced the long way
  round on a bone this format does animate. Body arches back under the raised
  arm and snaps forward at the locked f17 release — the opposite pairing to
  the uppercut. A test now pins the overhand signature (monotone rise through
  +180) so the two can never quietly swap back. Verified by pose strip; 268
  aachar tests green, full suite green.

  Lesson recorded for the next clip: name the MOTION, not the intent — the
  reference's character (overhand/underhand, arc direction, which way the
  body counter-moves) is the first thing to state out loud before authoring,
  because a wrong label survives every numeric check and dies only on eyes.

- **2026-07-29 (Phase 6d)** — **The clip tail closed: all 12 remaining
  referenced clips authored in one pass**, by the 6b/6c method — measure the
  reference for what the motion IS (each one named out loud first:
  greeting3 is a BOW, skill_magic LEVITATES, attack_bow's bow arm HOLDS while
  the string hand travels), then author from this rig's budgets and grammar,
  never from their numbers. New files `clips/cast.ts` (attack_magic,
  skill_magic, attack_bow, buff, concentrate) and `clips/floor.ts`
  (death_sleep → getup derived, sleep_idle + sit_idle over shared poses);
  greeting3 joined social.ts, the spear pair joined locomotion.ts with
  long_spear_walk derived from `move`. Coverage is now 100% of clip
  references in `content/`; only the 13 unreferenced engine clips still fall
  through.

  The gate and the strip both earned their keep once each: the first
  attack_magic (raise-hold-release) measured residual 0.30 — at threshold —
  and was restructured into a scoop rather than nudged; the first floor
  poses put the stick legs 35–55° into the ground and were caught only by
  the pose-strip review (all 12 clips held beat-by-beat against SPUM on the
  real character, two rounds). 268 aachar tests green (full suite 1361),
  tsc + lint clean.

- **2026-07-29 (Phase 5d, correction 2 — the jester hat)** — Playtest with the
  new `AA_jester` helmet showed hair escaping at the top sides again. Diagnosis
  against the real pixels: the saved profile was correct and the mask computed
  **zero rows in every column, correctly** — the hair's top (11px above the
  helmet anchor) is below the jester's top outline everywhere, and the leak was
  hair showing through the transparent notches UNDER the drooping prongs and
  bells, air the top-profile model assumes is solid hat. Fix: the mask now cuts
  at the helmet's **bottom edge** per column (`regionBottomProfile` /
  `measureBottomProfile` / `AaPart.contentBottomProfile`, superseding the
  top-profile trio), which subsumes the old rule — anything above the hem is
  either behind the opaque hat (which sorts over hair) or in a notch. Old
  helmets fall back to measuring the PNG; no re-save needed. Tests rewritten to
  the new convention plus a jester-shaped regression case (268 aachar green,
  tsc + lint clean). Not yet click-tested at `/admin/aachar` — verify the
  jester and re-check the sunhat there.

- **2026-07-29 (Phase 5e, correction — the dangling channel base)** — A
  recolour complaint ("deep red comes out light pink") unravelled into an
  apparent total-data-loss event, all one root cause: a colour channel created
  in the editor kept its placeholder `base: "#000000"` after tagging
  (`addChannel` seeds black; `toggleRampColor` never moved it), so (1) every
  pick drifted +0.96 lightness off the black anchor — white shirt, deep-red
  pick, pink result — and (2) once saved, `validateProject` rejected the whole
  project over it, which bricked the draft, the manifest, and the blank-boot
  recovery fetch simultaneously. The art was intact on disk the entire time.
  Three fixes: `toggleRampColor` re-anchors the base to the first colour tagged
  whenever the current base isn't in the ramp; validation repairs a dangling
  base (first ramp entry) instead of failing the project (decision revised
  above); the Colour channels panel badges a saved part still carrying one.
  272 aachar tests green (4 new), tsc + lint clean, manifest on disk verified
  healthy (20 parts, 2 characters).

- **2026-07-29 (later)** — Removed `attack_magic` and then BANNED it outright:
  `BANNED_CLIPS` in `clips/index.ts` (registry throws if one is ever authored),
  resolution (`clipLibrary.ts`) substitutes `idle` above all three layers so
  the SPUM fall-through can never play it, both editor dropdowns hide it, and
  `clipCoverage` neither counts nor suggests it. The scoop-vs-raise decision
  above stays as history. 1366 tests green (1 new), tsc clean. Then
  `move_carry` (the exact name only — `move_carry_loop` and the AA-original
  carry variants stay) joined `BANNED_CLIPS` and its `rampChannels` derivation
  left `clips/locomotion.ts`; the ban test covers every entry in the set.

- **2026-07-29 (the floor set redone: the neck-seam rule + the head bounce)** —
  Playtest: `death_sleep`'s head split from the body, and it fell forward
  where the reference falls onto its back. Diagnosis by DOM probe (slice
  rects at every held beat): the bones were rigidly attached to within 1px —
  the split was the ART. This character is one interlocked blob whose face
  straddles the head/body seam (the torso region's top rows are chin skin),
  and the head channel's pivot sits ~1px below that seam, so any relative
  head rotation opens a wedge at the seam's ends and any +y delta lifts the
  face apart. The clip's `head {rot 9, y +0.2}` was exactly that — the same
  failure `sit_idle`'s breath had already documented. **The neck-seam rule**
  now heads `clips/floor.ts`: head |rot| ≤ ~3° free, ~6° only with a ≥0.4px
  −y tuck, never +y; author head expression in HAT pixels (18px lever), not
  neck degrees.

  Then the fall was rebuilt to the reference's structure, measured first:
  SPUM's `death_sleep` is sway forward (f10) → teeter (f20) → collapse to
  −89° in ten frames (f30) → and the part that makes it FEEL, a head that
  keeps travelling to +8.1° relative TEN frames after the floor, then flops
  down in three — inertia the torso lost on impact. The AA clip keeps that
  phrase and none of the values: two-stage fall (the sink leads, the tip
  follows), a hip-thrust body x-path SPUM doesn't have (also what pushed the
  gate residual from a failing 0.28 to clear), bounce peaking sooner with a
  damped second settle, arms windmilling forward before flopping back.
  `SLEEP_POSE` flipped onto the back, so `getup` (derived reverse — the
  bounce replays as a nod on sitting up) and `sleep_idle` (belly-rise breath)
  followed for free; content's `death_sleep → sleep_idle → getup` chains are
  consistent throughout. The old face-down flop survives, seam-fixed and
  bounce-added, as AA-original **`fall_forward`**. Caught on the strip: the
  first on-back pose sent one leg to local −9 — a floating stick with no
  overlap on the lying torso (feet deltas ride the ±4 stance). All four clips
  reviewed as pose strips on the real character. 1366 tests green, tsc +
  lint clean.

- **2026-07-29 (Phase 8)** — **Library import shipped.** "Browse library…" in
  the Slots tab opens a Props / Sprites / Modern picker (search over
  keys/tags/packs; per-frame picker for sprite sheets; modern rides the
  `/modern-packs` dev endpoints), with two landing modes: **Pixelate** feeds
  the existing floating-draft flow via a new `externalFile` prop on
  `PartCanvas`, and **As-is** creates a hi-res part — the imported PNG stored
  at native resolution with two new opt-in `SpriteAtlas` fields
  (`pixelDensity`, folded into the slice scale the renderer already had;
  `smooth`, swapping that slice's `image-rendering` to `auto`). Display size
  is therefore just a number: resizing is lossless forever, and smooth/crisp
  is a per-part choice independent of resolution. Placement is encoded in the
  region pivot (headroom's trick), edited in a new `HiResPartEditor` with a
  drag-to-place ghost of the model's own head/torso (Phase 5d offset
  correction applied) and a live rig preview. Hair mask made density-aware
  (identical output at density 1, pinned by a doubled-fixture test); the save
  endpoint validates and passes the new fields through its field-by-field
  atlas rebuild; `AaPart.source` records provenance. Detection is field
  PRESENCE so a density-1 import still routes to the transform panel instead
  of the pixel canvas. Verified headless end-to-end (browse → import → smooth
  toggle flips the one slice to `auto` while the rest stay pixelated → resize
  reaches the rig → pixelate draft lands → modern tab loads; zero page
  errors, no writes). 29 new tests; 1386 green; tsc + lint clean.

- **2026-07-29 (Phase 8b)** — **Left hand un-dropped.** `weapon2` added to
  `AA_SLOTS` ("item L"; `weapon` relabelled "item R") after held items proved
  out in playtest. Pure table entries: the renderer already routed the slot's
  `Weapon` region to the `L_Weapon` bone — `SLOT_REGION_TO_BONE.weapon2` →
  `…/ArmL/P_LArm/P_Weapon/L_Weapon`, prefab z 19 so items sit gripped behind
  the front left arm — and the bone was already in the skeleton (D2). Entries
  in types/plugin/slots/hires + the SlotEditor tab list; everything else
  (validation, picks, save, export, hi-res editor, library browser) iterates
  the slot tables and picked it up for free. SPUM's shield tilt stays off by
  construction (`isShieldPart` reads the empty `config`). Verified headless:
  as-is import into "item L" renders a `weapon2:Weapon` slice on the left
  weapon bone at z 19, both hands holding items at once. D4 updated. 1386
  green; tsc + lint clean.

- **2026-07-29 (preview slot toggles)** — Per-slot visibility checkboxes on
  the preview panel: uncheck hat/clothing/etc to take a saved pick off the
  rig while drawing something under it (new hair vs a helmet). View-only —
  picks are untouched, nothing persists. Filtered out of `rawOverrides`
  BEFORE the live-edit layer merges, so the slot being drawn always shows,
  and a hidden helmet stops masking hair for free (the mask reads
  `rawOverrides.helmet`). The Animation tab inherits the filter through the
  `atlasOverrides` prop. tsc + lint clean.

- **2026-07-29 (Characters tab)** — **Randomize with per-slot locks.** New
  `lib/aachar/random.ts` + 🎲 button on the Characters tab, mirroring the SPUM
  harness's Random button: per-slot presence weights (body/cloth/eye/mouth
  always; hair 0.85, hat 0.5, item R 0.33, item L 0.15 — weighted by this
  pipeline's slot USAGE, so `faceHair`-as-mouth always rolls where SPUM's
  beard was 50%), and an L lock per Wearing row that keeps the slot's part +
  colour picks + appearance through a reroll (SPUM's `IsSpriteFixed`
  contract). Every colour channel the rolled outfit declares gets a fresh
  tint, hue unrestricted but sat/lightness mid-band so the ramp survives;
  unlocked slots' appearance is cleared (random HSB is mud). Rerolls change
  the outfit, never the build — name and proportion deltas ride through.
  Locks are session state, not character data. RNG is injectable, so the
  6 new tests are deterministic. 307 aachar tests green; tsc + lint clean.

- **2026-07-29 (placement)** — **Characters tab gained a Placement panel**:
  per worn slot, nudge x/y (source px), rotate (degrees about the anchor,
  + = clockwise), and a horizontal flip — saved on the character
  (`AaCharacter.placement`, identity entries deleted), validated on load, and
  persisted with everything else through the manifest autosave. Rendered via
  a new additive `slotAdjustments` seam on `SpumCharacter` (slot-keyed on
  purpose; see the decisions log) that composes with the existing per-part
  `PartNudge` — `PartNudge` itself learned `rot` and `flipX`. The placement
  follows the character everywhere it renders: main preview and all three
  Animation-tab rigs. New tests for validation, identity-drop, and the
  `toSlotAdjustments` conversion; full suite 1426 green; tsc + lint clean.

- **2026-07-29 (Phase 10)** — **Outfit presets + suggested names shipped.**
  `AaOutfit` (a character's look — picks/colours/appearance/placement, no
  skeleton) on `AaProject.outfits`; Characters tab gained an Outfits section
  (save current look, wear on any character with a "wearing" marker, delete)
  and both prompts now default to real suggestions (`lib/aachar/names.ts` —
  48-name pool for characters, cloth-pick-derived for outfits,
  "shirtpants" prefix stripped). Look validation extracted from
  `validateCharacter` and shared with `validateOutfit`; autosave / save
  endpoint / export bundle all carried the new field with zero changes. 28
  new tests in `lib/aachar/outfits.test.ts`; full suite 1443 green; tsc
  clean; headless browser pass on the real project confirmed the section
  renders and both prompt defaults are valid, with no writes.

- **2026-07-30 (Phase 10, data)** — **20 themed outfits pre-populated** from
  the batch-authored part sets (accountant with eyeshade + calculator +
  ledger, ninja, detective, wizard, knight w/ sword+shield, pirate, chef,
  king, astronaut, surgeon, devil, skeleton, grad, referee, hawaiian, tuxedo,
  elf, vampire, prisoner, sheriff), written straight into the manifest's
  `outfits` array — each a COMPLETE look (body/eye/mouth included, since
  apply is a wholesale replace), every pick cross-checked against the real
  part library by the populating script (a miss aborts). Upserted by name so
  hand-saved outfits survive a re-run. Verified read-only in a headless
  browser: fresh boot adopts the manifest (validateProject on the real file),
  all 20 chips render, no page errors. ⚠️ An editor tab whose draft predates
  this needs **Load from disk** once — its next autosave would otherwise
  write the outfit-less draft over the manifest.

- **2026-07-30 (Phase 5f)** — **Hat-hair modes shipped; the always-on hair
  mask is gone.** `lib/aachar/mask.ts` + `SpumCharacter.hairCropProfile` (the
  clip-path seam) deleted; `lib/aachar/hatHair.ts` computes a per-column plan
  (crop + under-hat flags, same bottom-edge geometry, now placement-dx/dy
  aware) and pure pixel passes for seven selectable modes — none / tuckHat
  (the old rule) / tuckHem (hem extends sideways, kills the wings) / tuckLine
  (straight cut at the hat's lowest pixel) / spill (1px hair-coloured puff +
  line-colour outline where hair is wider than the hat) / spillShadow (+
  darkened row under the hem) / squash (columns compress instead of
  deleting). Baked into the hair atlas as a data URL by
  `hatHairAtlas.ts` (cached, identity = no-op, cleared on part save next to
  the recolour cache) via a `useHatHairedOverrides` hook that runs after the
  recolour hook, so spill picks up the character's chosen hair colour.
  Selector lives under the Wearing table (visible only with hair + hat
  picked); `AaCharacter.hatHair` ("none" deleted, placement identity rule),
  carried by outfits and the shared look validation; preview badge names the
  active mode. Old mask fixtures ported to `hatHair.test.ts` with tuckHat
  asserting the exact old numbers; 23 tests there, full suite 1455 green,
  tsc + lint clean.

- **2026-07-30 (Phase 5f, playtest round)** — **Grow-to-hem + the tall
  spills.** Playtest (Otto: sunhat nudged up 2.5px, crown + rainbowfro on
  spillShadow) surfaced two gaps: raising the hat left a strip of air the cut
  couldn't fill, and a fractional placement left a half-pixel seam under the
  hem. Fixes: the plan now carries the RAW hem row (unclamped, floored — the
  error side is overlap behind the hat, never air), and every mode gained a
  grow pass that vertically stretches under-hat columns up to the hem
  (inverse of squash's resample; capped at the canvas top; never beside the
  hat). Plus three new spill variants the playtest asked for — `spillTall`
  (2px), `spillWild` (deterministic 1–3px in 2px chunks), `spillSlope`
  (3px against the hat's side, tapering by column distance) — all with the
  brim shadow, driven by one parameterised puff-height table. Plan shape
  changed `crop` → `hem: (number|null)[]` (null = no hem, tuckHat's uncovered
  columns). 31 tests in `hatHair.test.ts`, full suite 1463 green, tsc + lint
  clean.

- **2026-07-30 (Phase 11)** — **Eye states shipped (open / half / closed).**
  The eye sheet grew a third gutter-separated band (`FreeHalf`, between open
  and blink — `buildSlotSheet`; the region name lives in `lib/aachar/slots.ts`
  because the renderer never needs it), and the state itself is a render-time
  region swap: `applyEyeState` (lib/aachar/render.ts) clones the atlas with
  its `Free` rect pointed at the chosen band — zero `lib/spum/` changes, the
  FreeClose-on-blink-bone fall-through untouched. The swap runs LAST in the
  admin's override pipeline (after recolour + hat-hair, rects only, caches
  warm) and is gated on `AaPart.eyeBands` has-art flags measured at save
  time, so a pre-Phase-11 two-band part or a blank band renders open instead
  of vanishing — verified on the rig: `damaged` (which now ships
  `eyeState: "closed"`, as does `concentrate`) plays eyes-open on an
  unflagged part. Precedence: Slots-tab preview toggle (bypasses the gate via
  `FORCE_EYE_BANDS` so unsaved bands are visible) → the playing clip's
  whole-clip `AaClip.eyeState` (new field; checkClip-validated, Copy-TS
  round-trips, editable in the AnimationTab header) → the character's
  resting `eyeState` ("open"|"half", "open" deleted-not-stored, "closed"
  rejected by validation; outfits deliberately don't carry it — D12's line).
  Authoring: "Copy open → half/blink" buttons on the eye canvas (wholesale
  replace, one undo step); Characters tab "eyes" select with the half option
  disabled-with-reason until a flagged part exists; Randomize rolls half at
  0.25 only on flagged parts, riding the eye slot's lock. Old parts migrate
  by region name on reopen (half band arrives blank; pinned by test), and
  three max-dim bands still clear the 512px save cap. 27 new tests in
  `eyeState.test.ts` + updated `slots.test.ts`; full suite 1482 green; tsc +
  lint clean; headless pass over all four surfaces (three-band canvas, half
  preview on the rig via copied band, Characters select + hint, AnimationTab
  select preloaded "closed" on `damaged`).

- **2026-07-30 (Phase 12)** — **Pupils shipped: per-eye nudge + gaze.** The
  pure core is `lib/aachar/gaze.ts`: pupil = flood of the marked pixel's
  exact colour clipped to its box; whites = opaque box pixels neither pupil
  nor outline-dark (`DEFAULT_PROTECT_LIGHTNESS`, the recolour constant); a
  gaze direction resolves per eye to the furthest offset keeping EVERY pupil
  pixel on whites-or-vacated-pupil (range derived from the art — no tuning
  knob exists); vacated pixels heal with the nearest whites colour; the
  per-eye nudge lifts the whole box content and applies in EVERY band while
  gaze applies only in the open one. `gazeAtlas.ts` is the browser half
  (decode → pass → data URL, size-capped caches since inputs are often
  data URLs, `clearGazeCache` on save), and `useEyeAdjustedOverrides` slots
  it into the pipeline between hat-hair and the Phase-11 band swap — pixels
  first, rect repoint after; still zero `lib/spum/` changes. Data:
  `AaPart.eyes` (two band-relative boxes + pupil marks, validated
  pupil-inside-box), `AaCharacter.eyeNudge` (placement convention, ±32,
  identity-deleted, deliberately not on outfits), `AaClip.gaze` (whole-clip,
  mirrors `eyeState`, Copy-TS round-trips). Authoring: an "Eyes & pupils"
  panel on the eye canvas — auto-detect boxes via connected components
  (two largest blobs, leftmost = left-on-screen), marquee-selection → box as
  the fallback, armed pupil clicks, canvas overlay, marks saved with the
  part (incomplete drafts carry saved marks forward; Clear is explicit) —
  plus a gaze pad in the Slots tab, per-eye dx/dy controls in the Characters
  tab (gated on marks), and a gaze select in the AnimationTab header.
  17 new tests in `gaze.test.ts`; suite 1499 green; tsc + lint clean.
  Verified END-TO-END headless on the real project: auto-detect found both
  eyes of the saved `eyes` part, pupils clicked via canvas-pixel search,
  marks landed in the manifest (autosave — wait for the badge, not the Save
  click), and setting clip gaze "left" on `idle` flipped exactly the eye
  slices to baked data URLs and back to canonical on "centred", pupils
  visibly left in the render. Gotcha for next time: `getByRole` canvas
  clicks must target the VISIBLE canvas (the Body tab's stays mounted
  hidden) and use element-relative positions — button clicks auto-scroll
  and invalidate absolute coordinates.

- **2026-07-30 (Phase 13)** — **Auto-shading + shadows shipped.** The pure
  core is `lib/aachar/shade.ts`: an erosion pass marks a `depth × density`
  band along the away-from-light edges (transparent OR protected pixels
  count as background, so the shade line lands on the fill inside the
  outline), then each marked colour steps down the part's EFFECTIVE ramp —
  `effectiveRamps` replays recolour + appearance per entry — or synthesises
  in OKLab (−0.09 L, chroma ×1.15) when off-ramp. Styles: `soft` (1px,
  checker-dithered), `cel` (1px solid), `hard` (2px + a lit-edge highlight
  stepping UP the ramp). Directions `left`/`top`/`right`/`below`; `below` is
  the campfire underlight and is just the inverted offset.
  `shadeAtlas.ts` is the browser half (identity contract shared with the
  other bakes; direction is in the cache key — the whole cost of the
  scene-light feature is ≤4 bakes per variant), `useShadedOverrides` chains
  LAST after the eye passes, eye slot excluded. Character data:
  `shading` + `groundShadow`, identity-deleted, validated, NOT on outfits;
  light direction is a preview lens (💡 select above the rig), never stored.
  Ground shadows composite under the rig in the admin preview: ellipse
  (offset away from the light) or silhouette (same rig, `brightness(0)` +
  `scaleY(-0.45) skewX(∓32°)` about the feet — follows the pose free).
  17 new tests in `shade.test.ts`; suite 1516 green; tsc + lint clean.
  Scene plumbing (`SceneScript.light`) and occlusion shading deferred —
  both documented in the Phase 13 section.

- **2026-07-30 (head variety)** — **Seven new body parts shipped**, all
  script-generated against the untouched 17×10 head box (geometry, cloth
  and every clip unchanged by construction): `blockhead`, `ballhead`,
  `slimhead`, `jawhead`, `egghead`, plus two tagged `zombie` —
  `rothead` (lopsided, caved crown) and `lurchhead` (cracked flat-top
  slab) — so themed rolls now always deal a rotted skull while plain
  Randomize never does (the pool rule needed no code; the stale
  "there's no zombie body" comment in `random.ts` was updated).
  Authoring rules derived from the torso art and worth keeping: two
  colours only (skin `#e8c39e` under the `skin` channel + outline
  `#1a1c2c`), bottom row OPEN (no outline — it's the neck seam) with its
  skin span covering the body's neck (cols 7–10), and the face core
  (cols 6–12, rows 3–8) kept solid skin so every existing eye/mouth part
  lands on skin. Each new part copies torso's `authoredFor` +
  `colorChannels`, so zombie skin palettes recolour them like any body.
  The Body tab grew the same parts panel the Slots tab has (picker,
  + New, theme tags, delete-guarded-to-last) — it previously hardcoded
  `partsInSlot(...)[0]`, which would have made every second body
  unreachable and silently overwritable. PartCanvas remounts per part,
  same rationale as SlotEditor. Suite green, tsc + lint clean. Known
  seam not addressed: outfits capture the `body` pick and apply
  wholesale, so wearing an old outfit swaps a character's head back —
  excluding body from outfits is a candidate follow-up.
- **2026-07-30 (Phase 14d)** — **The raider theme shipped** — the second
  generator, built to prove the theme seam holds: `RAIDER_THEME` +
  `RAIDER_CLOTH_PALETTE` in `random.ts`, a 🪓 Raider button beside 🧟, and
  `scripts/aachar-raider-gen.js` generating the whole tagged set (2 eyes,
  3 mouths, 2 hats, 37 `*patched` cloths — 44 parts). New palette
  mechanism: an EMPTY theme palette entry (`skin: []`) defers to the
  channel's own `randomPalette`, keeping raider skin human while cloth
  goes rust-and-leather; pinned by test. Patch placement is tiered so
  striped/black cloths still get patches. 2 new tests; suite 1530 green;
  tsc + lint clean. Reviewed by contact sheet; Spike/Rusty/Gouge rolled
  headlessly against the real manifest.
- **2026-07-30 (Phase 14e)** — **The robot theme shipped** — the first
  theme with full chassis bodies: `botbody` + `tvhead` (square/CRT heads,
  boxy panel-seam torso, 2px legs into square boots, claw arms with the
  fists in the base positions so weapons anchor unchanged), drawn in the
  standard two-colour body scheme so `ROBOT_THEME`'s metal skin palette is
  what makes them robots — the bodies' own channel `randomPalette` is also
  metals, so no path deals a flesh robot. Plus `ledeyes` / `visoreyes`
  (3 bands: low-power half, powered-off close w/ standby dot; sensor
  pupils deliberately NOT outline colour so the pupil flood can't leak
  into the frame) and `grillmouth` / `wavemouth`. 🤖 button beside 🪓;
  cloth presence 0.3 (bare chassis default, clothed robots as the gag).
  2 new tests; suite 1532 green; tsc + lint clean. Contact-sheet reviewed;
  Clank/Servo/Ledgertron rolled against the real manifest. Follow-up: first
  in-editor look should confirm claws/boots track through clips.
- **2026-07-30 (Phase 14f)** — **The skeleton theme shipped**: `bonebody`
  chassis (skull w/ cheekbones + tapered jaw, sternum-split ribcage,
  knobbed limb bones), `socketeyes` (glow-pinprick pupils, squint half
  band), `teethmouth` / `boneagape`, 💀 button beside 🤖. Bone tones are
  mid-lightness ivories (true white would collapse the recolour ramp);
  grave-dirt `defaultPalette` shared with the zombie. First theme-shared
  art: the 37 `*torn` cloths are now dual-tagged `zombie` + `skeleton` —
  the tag array IS the sharing mechanism, no code change; pinned by test.
  2 new tests; suite 1534 green; tsc + lint clean. Ribcage redrawn once
  after the contact sheet read as stripes; Rattles/Femur/Calcium rolled
  against the real manifest (Femur wears a torn shirt + gradcap).
- **2026-07-30 (Phase 14g)** — **The cultist theme shipped**: the Cult of
  the Ledger. First authored themed cloths (`cultistrobe` w/ eye sigil +
  gold rope, `sigilrobe` w/ open-ledger sigil — both using the never-used
  region row 8 as robe length), `cultisthood` (first helmet to drape past
  the hem: side curtains rows 25-31 framing the face, gold brow band),
  `tranceeyes` (solid possessed gold), `chantmouth`/`blissmouth`.
  🕯️ button beside 💀. New: gold on a dedicated `sigil` channel id so
  the theme gilds trim while vestment darks take `primary`; sigil pupils
  near-black so protect keeps them constant. Pale-skin curated palette.
  1 new test; suite 1535 green; tsc + lint clean. Contact-sheet reviewed;
  BrotherDebit/SisterCredit/TheAuditor rolled against the real manifest.
  Reminder that bit us twice today: after any generator run, the open
  editor tab must "Load from disk" BEFORE its next autosave, or the save
  clobbers the registrations (script now prints the warning).

- **2026-07-30** — **The armory lands: 250 original items registered.**
  Nine themed generator batches (cash/paperwork, food+drink incl. the
  Walking Bread, medical+lab incl. the toe jar, fishing, tools+trade,
  old-set restyles under fresh names, story props incl. the device and
  Bram's five gift scraps, pirate hoard, wild west) drawn clean-room in
  `scripts/aachar-weapon-gen.js`, reviewed on contact sheets, browsable on
  the "AA Armory" gallery artifact. `scripts/aachar-register-items.js`
  bulk-registers staged `AA_*.atlas.json` pairs into the manifest (name =
  file minus prefix; weapon slot only; skips registered; `--dry`); weapon
  parts 18 → 268, item L served by the same registrations via the
  slot-borrow rule. Two UI doors: **🔍 thumbnail grid picker** on the
  Wearing table's item R / item L rows (`ItemPickerModal.tsx` — search,
  unbounded scroll, lazy thumbs; dropdown untouched for quick picks) and
  an **Armory tab** in the library browser (reads the manifest, feeds the
  existing hi-res import so item art can become hats/shirts; the tab's
  caption points hand-equipping back to the 🔍 picker). Reusable prompt:
  `/aachar-items <theme>` (.claude/commands/aachar-items.md). 1535 green;
  tsc + lint clean. Same clobber rule applies: "Load from disk" (or
  reload) before the open editor's next save.

- **2026-07-30** — **The clip tail is closed: no engine name plays SPUM's
  motion anymore.** The 13 unreferenced engine clips (`run2` `jump` `jump2`
  `short_sword_attack` `axe_attack` `skill_melee` `long_spear_attack`
  `skill_bow` `sit` `sleep` `death_sit` `die` `debuff_stun`) were authored
  by the Phase 6c method — budgets + grammar, interior beats off SPUM's
  pose keys, structure studied from the references but never their values —
  taking the library 29 → 42 clips. Shapes worth knowing: `sit`/`sleep`
  END on `SIT_POSE`/`SLEEP_POSE` (extracted `SIT_POSE` from sit_idle's
  inline rest), so transition → idle chains pop-free by construction;
  `die` is `fall_forward`'s face-plant phrase at the locked 40f ending on
  the shared `FACEPLANT_POSE`; `death_sit` stays SEATED where SPUM's lies
  flat; `axe_attack` is ONE buried chop where theirs is two; `jump2` and
  `yay` are the two derived-variant clips (`applyVariant`);
  `long_spear_attack` rides the new `SPEAR_GUARD_REST` shared with the
  spear idle; `debuff_stun`/`death_sit`/`sleep`/`die` use Phase-11
  whole-clip eye states. The originality gate caught three channels on the
  first cut (sleep/body, sleep/lfoot, death_sit/lfoot at 0.26–0.29 — the
  monotonic go-to-floor ramps scale onto SPUM's) and the fix was
  structural, not numeric: sleep now sits hunched FORWARD before flopping
  back with knees up, death_sit's legs kick briefly airborne off the seat
  impact. All 13 reviewed as pose strips against SPUM on the real
  character (harness rebuilt headless: temp `src/__strips_harness.tsx` +
  playwright driver, both deleted after; strips rendered clean, no
  retakes needed). `clipLibrary.ts`'s layer-3 fall-through survives as a
  safety net for future engine names only; the `clipSource === "spum"`
  test now proves it with a hypothetical name. Suite 1535 green; tsc +
  lint clean.

- **2026-07-30 (playtest)** — **Neck-seam pass on the standing clips.** User
  report: head slightly detaching on `concentrate` / `attack_bow` /
  `skill_magic` / `greeting3` / `buff`. All five violated the floor set's
  neck-seam rule in one of its two ways: a POSITIVE head y (concentrate's
  rock-back +0.2, buff's puff +0.3, skill_magic's hover +0.3/+0.4 — the face
  lifts straight off the chin) or >3° of head rot without the ≥0.4 tuck
  (concentrate's 5.5° total, greeting3's held bow at 5–6° with only 0.2,
  attack_bow's draw at 4°/0.2). Fixes keep each clip's read: skill_magic's
  look-up capped at −5/−6° with full tucks (the body's backward lean carries
  the upward read), buff's chin-up kept as −rot with the lift moved to
  root/body, concentrate's tuck moved into its REST because the lean-in
  beat stacks on top. Same class fixed preventively in `jump` /
  `skill_melee` apexes (−5° untucked; `jump2` inherits via derivation).
  None of these clips carry manifest overrides, so the library fix is what
  plays. Re-verified by pose strip on the real character; suite 1535 green.
  Rule of thumb now proven outside the floor set: the seam rule applies to
  EVERY clip, not just lying-down poses — audit head channels against it
  whenever a clip is authored.

- **2026-07-30 (Phase 7)** — **Content integration shipped: AA characters
  in scenes.** `SceneActor.aachar: { name, hide? }` renders the named
  character through a new scene-side bridge (`lib/aachar/sceneCast.ts` +
  `AaSceneCharacter.tsx`): manifest + base skeleton fetched once per
  session, sync resolve (composed skeleton, raw atlases, slot adjustments),
  then the editor's exact bake chain async on top (recolour → hat-hair →
  eye nudge → eye-state swap → shade, all served by the lib caches), and
  `compiledAaClip` per play action via `clipOverride`. `SceneScript.light`
  landed with it (Phase 13's promised wiring), facing-mirror handled.
  Validation: Zod shape + AA-slot check for `hide`, config-or-aachar,
  aachar×mount exclusion; the character-NAME roster is enforced by
  `scripts/validate-content.ts` reading the manifest via fs (D5 keeps it
  out of the module graph, so the browser-side call can't). First shipped
  use: **`unit1-lesson1b-ex8`** — Ida replaces Griselda's SPUM rig under
  the same actor id (zero action/anchor edits), axe hidden because the
  hand-off props anchor to `R_Weapon`, and the exit re-timed from banned
  `move_carry` to `move_carry_loop`. `SceneActor.config` went optional,
  which forced minimal guards in `SpumSceneEditor`'s ActorRow (the one
  deliberate crack in the never-touch-admin-spum rule — it would have
  crashed loading any AA scene; SPUM actors render byte-identically).
  Verified: tsc + lint clean, 1535 tests green, content validator passes
  with the roster, and a headless playthrough of ex8 shows the full beat
  sheet working (cash out → blender in → carry-walk exit). Authoring guide
  written as **`docs/spum-scene-authoring.md` §25**, which now declares
  SPUM legacy for new scenes. Deferred, recorded in §25: per-clip
  eyeState/gaze in scenes, eye/gaze scene actions, ground shadows in
  scenes, AA-original clip names in the scene schema, mounts.

- **2026-07-30 (playtest, Phase 7 follow-up)** — **The exchange snap:
  `givereceive` rebuilt as `receive + give` with neutral endpoints.** First
  scene playthrough of an AA one-shot surfaced it: Ida's hand "snaps back"
  when `givereceive` ends and the actor reverts to idle. Measured both
  rigs' clips: SPUM's givereceive runs rest (−12°) → extended (−60°) at
  0.217 → back to rest by 0.861, so its one-shot ends ON the idle pose and
  the revert cut is invisible. The AA library kept SPUM's catalog
  derivation (`give + receive`) but had authored `receive` with the
  OPPOSITE polarity (rest→contact where SPUM's retracts contact→rest), so
  the derived exchange came out extended at BOTH ENDS — the revert cut
  snapped from a fully stretched arm. Fix in `clips/social.ts`: concat as
  `receive + give` (contact stays exactly at the locked halfway f26 =
  +0.433s, so no scene retiming anywhere) and pin both endpoints to TRUE
  neutral (empty pose, rest folded into the interior beats) — idle breathes
  around the neutral stance, so the one-shot now starts and ends where
  idle lives, the AA equivalent of SPUM's −11.5° property. Still a pure
  function of `receive`. Test pins the contract (contact pose at f26,
  empty endpoints, empty rest). Suite 1535 green; verified in ex8
  headlessly — hand out + cash mid-flight at t≈1.5, arm home BEFORE the
  clip ends, nothing to snap at the revert. ⚠️ Standalone `give`/`receive`
  plays in content carry the same polarity inversion vs SPUM (AA receive
  contacts at its END) — review those scenes' reads separately before
  changing anything; they may have been timed against either shape.

- **2026-07-30 (playtest, the snap AGAIN — the override layer)** — The
  library rebuild above **didn't reach the screen**: the manifest carries
  `model.clips` overrides for 12 clips (`idle`, `move`, `givereceive`,
  `throw`, …stale editor working copies) and **an override SHADOWS the
  library** (`resolveAaClip` layer 1), so scenes and the editor kept
  playing the old extended-at-both-ends givereceive. User diagnosed the
  right shape from the editor's beat list: the cycle should run 26 (hand
  at bottom) → 40 → 52/0 (contact) → 12 → back to 26. That is a −26
  rotation, landing beats at 0/14/26/38/52 — structurally identical to the
  library fix — so the OVERRIDE was rewritten in place with the user's own
  hand-tuned poses (the old f26 "hold" turns out to hold `rarm +28` over
  the −30 rest ≈ −2° absolute — genuinely idle's arm). Contact stays at
  f26/+0.433s; endpoints are the hand-at-bottom hold; verified in ex8
  headlessly (arm extended at contact t≈1.65, fully home past the one-shot
  boundary at t≈2.1). ⚠️ **Lesson, general:** before concluding a clip
  change "didn't work", check `model.clips` in the manifest — the
  override layer wins over `lib/aachar/clips/` silently. The other 11
  overrides are untouched and still shadow their library entries.

- **2026-07-31 (clip promotion — the library is the master again)** — All 12
  manifest `model.clips` overrides (the user's hand-tuned motion: `idle`,
  `move`, `givereceive`, `throw`, `move_1handcarryup_loop`, `greeting1`,
  `run`, `death_sleep`, `getup`, `sleep_idle`, `attack_melee`,
  `long_spear_idle`) were promoted into `lib/aachar/clips/` via
  `clipToSource` and the override layer was CLEARED — one source of truth,
  no shadowing. Playback equivalence was proven numerically before clearing
  (compiled library vs the backed-up overrides, 40 samples × all bones × 12
  clips: identical). Derivation changes: `givereceive` and `getup` are now
  authored literals (the tuning reshaped their interiors, so
  reverse/concat no longer reproduce them — comments in social.ts/floor.ts
  say so); `move_1handcarryup_loop` KEPT its derivation — the tune was just
  `CARRY_1HANDUP_ARMS.rarm` −50→−99 — so it and the other carry/spear-walk
  variants re-derive from the promoted `move`. Floor-set note: the
  SLEEP_POSE mechanical coupling (fall/sleep/rise built from one pose) is
  gone; their chain poses still match by tuning, but retune them together.
  Test knock-ons, both pinned with comments: idle's breath beat moved
  f11→f10 (a coincidental SPUM pose-key frame — added to the gate's
  LOCKED_INTERIOR exceptions; value-level gates still apply), idle now
  carries its own rest lean (posture-variant test adds to it), and the
  givereceive test pins the CONTRACT (contact role at f26, first==last
  endpoint pose, absolute end arm within 8° of stance) instead of the dead
  derivation. Suite 1535 green, tsc + lint clean, manifest re-validated.
  Backup of the pre-promotion manifest: the session scratchpad
  (`manifest-backup-prepromotion.json`).

- **2026-08-04 (library items tab + hi-res pixel editing)** — Two Slots-tab
  import upgrades. **(1) "Items" tab in Browse library** (was "armory"): lists
  every part pickable in the Characters tab's item R / item L rows (`weapon`
  AND `weapon2` slots, read from the manifest), with name captions under the
  thumbnails and the part's single region rect passed as the pick's `frame`,
  so a pixel part's gutter border is cropped before import. Provenance stays
  `armory:<name>`. **(2) Pixel editing in `HiResPartEditor`** — the as-is
  path's "deliberately no pixel editing" rule is retired: pencil / eraser /
  eyedropper (+ brush size, undo/redo with Ctrl+Z/Ctrl+Shift+Z, 40 deep) now
  stroke the part's NATIVE pixels on a work canvas seeded from the art;
  Move keeps the old drag-to-place. A stroke commits on mouseup by
  regenerating `art.dataUrl`, so the rig preview and Save pick up edits with
  zero new plumbing (the seeding effect is guarded by the last-committed URL
  so commits never wipe the undo stack). Pencil clears before filling so
  painting over semi-transparent pixels replaces instead of blending; edits
  work on fresh drafts AND reopened saved hi-res parts; multi-region (text-
  stamped) parts stay locked. What stays out by design: PartCanvas's
  sprite-grid machinery (regions, palette channels, onion) — logical-res
  only. Also fixed: `SlotEditor.tsx` contained a literal NUL byte in the
  `NEW_PART` sentinel string (now a space — same can't-collide property),
  which made ripgrep treat the file as binary and hid it from every search.
  1771 tests green, tsc + lint clean.

- **2026-08-04 (hi-res rotation + provenance reassurance)** — Follow-up to the
  pixel tools. **Rotation** in `HiResPartEditor` is a live TRANSFORM slider
  (−180°…180°): every angle re-renders from the pre-rotation pixels held in
  `rotBaseRef`, so scrubbing never compounds resampling and 0° restores the
  base byte-exact (verified headless). Output is supersampled up to
  `MAX_HIRES_DIM` (4× for a 32px item) with nearest-neighbour for crisp art /
  interpolation for smooth, so a rotated pixel item keeps square pixels
  instead of being chewed through its own grid; `logicalHeight` auto-scales
  by the bbox ratio so the on-rig size holds. The rotation BAKES (becomes the
  new base, slider snaps to 0) only when a stroke lands on it, or on Save.
  Strokes, undo/redo restores, and manual height changes all re-anchor the
  base so later rotations start from what's on screen; Save/Stamp read the
  work canvas directly, so the debounced commit can never save stale art.
  Gotcha fixed en route: the rotation render left its
  translate/rotate/scale on the work canvas 2D context, silently warping the
  next stroke's fillRects out of bounds — `setTransform(1,0,0,1,0,0)` after
  rendering. Also added an explicit provenance notice on fresh drafts ("Save
  creates a part of its own in this slot — the library art you picked is a
  copy and is never modified"): imports always copy pixels, saves write only
  `/aachar/parts/<open slot>/`, and fresh-draft names dedupe via
  `suggestPartName`, so making a hat from an armory item cannot alter the
  item. Full headless pass (items tab → import → draw/erase/undo → rotate →
  0° byte-exact restore → bake-on-stroke → undo). 1771 green, tsc + lint
  clean.
