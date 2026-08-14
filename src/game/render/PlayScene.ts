// The Phaser play scene: a pure VIEW over the sim. Fixed-timestep stepping
// with render interpolation would be ideal; at 60hz sim and 60hz display we
// step 1:1 with an accumulator, which keeps the sim deterministic while the
// view stays dumb. All game rules live in ../sim.

import Phaser from "phaser";
import type { BakedCharacter } from "../../aachar/baker";
import { CMD_JUMP } from "../core/input";
import type { InputSampler } from "../core/input";
import {
  BUBBLE_R,
  FIELD_H,
  FIELD_W,
  GRID_H,
  GRID_W,
  TICK_MS,
  TILE,
  YEEHAW,
} from "../sim/constants";
import { T_PLATFORM, T_SOLID, T_SPIKES } from "../levels/types";
import type { FxEvent, Sim } from "../sim/types";
import { step } from "../sim/sim";
import { FOOD_TIERS } from "../sim/items";
import {
  pixelFrameKey,
  registerBaked,
  registerBubbleTextures,
  registerPixel,
  registerWorldTiles,
} from "./textures";
import { CRITTER_SPRITES, BOSS_SPRITES, MISC_CRITTERS } from "./sprites-critters";
import {
  FOOD_SPRITES,
  MISC_ITEM_SPRITES,
  PROJECTILE_SPRITES,
  SPECIAL_SPRITES,
} from "./sprites-items";
import { SPR_JAR } from "./pixelart";

export type PlaySceneHooks = {
  sampler: InputSampler;
  getSim: () => Sim;
  /** called once per sim tick after stepping, with drained fx */
  onFx: (events: FxEvent[]) => void;
  onTick: () => void;
  paused: () => boolean;
};

export class PlayScene extends Phaser.Scene {
  private hooks!: PlaySceneHooks;
  private baked!: Map<string, BakedCharacter>;
  private accumulator = 0;
  private prevInputs: [number, number] = [0, 0];
  private tilesDrawn = false;
  private tileGroup: Phaser.GameObjects.Image[] = [];
  private sprites = new Map<string, Phaser.GameObjects.Sprite | Phaser.GameObjects.Image>();
  private texts = new Map<string, Phaser.GameObjects.Text>();
  private zoneGfx!: Phaser.GameObjects.Graphics;
  private bossBar!: Phaser.GameObjects.Graphics;
  private levelKey = "";

  constructor() {
    super("play");
  }

  init(data: { hooks: PlaySceneHooks; baked: Map<string, BakedCharacter> }) {
    this.hooks = data.hooks;
    this.baked = data.baked;
  }

  create() {
    const sim = this.hooks.getSim();
    // background gradient
    const bg = this.add.graphics();
    bg.fillGradientStyle(
      sim.world.palette.bgTop,
      sim.world.palette.bgTop,
      sim.world.palette.bgBottom,
      sim.world.palette.bgBottom,
      1,
    );
    bg.fillRect(0, 0, FIELD_W, FIELD_H);
    bg.setDepth(-100);

    registerBubbleTextures(this);
    for (const [key, spr] of Object.entries(CRITTER_SPRITES)) registerPixel(this, `e:${key}`, spr);
    for (const [key, spr] of Object.entries(BOSS_SPRITES)) registerPixel(this, `boss:${key}`, spr);
    for (const [key, spr] of Object.entries(MISC_CRITTERS)) registerPixel(this, `m:${key}`, spr);
    for (const [key, spr] of Object.entries(FOOD_SPRITES)) registerPixel(this, `f:${key}`, spr);
    for (const [key, spr] of Object.entries(SPECIAL_SPRITES)) registerPixel(this, `s:${key}`, spr);
    for (const [key, spr] of Object.entries(PROJECTILE_SPRITES)) registerPixel(this, `p:${key}`, spr);
    for (const [key, spr] of Object.entries(MISC_ITEM_SPRITES)) registerPixel(this, `i:${key}`, spr);
    registerPixel(this, "i:jar", SPR_JAR);
    for (const [name, b] of this.baked) registerBaked(this, `cast:${name}`, b);

    this.zoneGfx = this.add.graphics().setDepth(30);
    this.bossBar = this.add.graphics().setDepth(90);
    this.drawLevel();
  }

  /** (Re)draw the static tile layer for the current sim's level. */
  drawLevel(): void {
    const sim = this.hooks.getSim();
    const key = `${sim.world.index}:${sim.levelIndex}`;
    if (this.levelKey === key && this.tilesDrawn) return;
    this.levelKey = key;
    this.tilesDrawn = true;
    registerWorldTiles(this, sim.world);
    for (const img of this.tileGroup) img.destroy();
    this.tileGroup = [];
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const t = sim.level.collision[y][x];
        if (t === 0) continue;
        const tex =
          t === T_SOLID
            ? `w${sim.world.index}:solid`
            : t === T_PLATFORM
              ? `w${sim.world.index}:platform`
              : `w${sim.world.index}:spikes`;
        const img = this.add.image(x * TILE, y * TILE, tex).setOrigin(0, 0).setDepth(-10);
        this.tileGroup.push(img);
      }
    }
    // secret door
    if (sim.secretDoorOpen && sim.level.secretDoor) {
      const d = this.add
        .sprite(sim.level.secretDoor.x, sim.level.secretDoor.y, "i:secretdoor#0")
        .setOrigin(0.5, 1)
        .setScale(2)
        .setDepth(-5);
      this.tileGroup.push(d as unknown as Phaser.GameObjects.Image);
    }
  }

  update(_time: number, delta: number): void {
    if (this.hooks.paused()) return;
    this.accumulator += Math.min(delta, 100);
    const sim = this.hooks.getSim();
    while (this.accumulator >= TICK_MS) {
      this.accumulator -= TICK_MS;
      const inputs: [number, number] = [
        this.hooks.sampler.sample(0),
        this.hooks.sampler.sample(1),
      ];
      step(sim, inputs, this.prevInputs);
      this.prevInputs = inputs;
      if (sim.fx.length) this.hooks.onFx(sim.fx);
      this.hooks.onTick();
    }
    this.drawLevel();
    this.render_(sim);
  }

  // ------------------------------------------------------------ rendering

  private used = new Set<string>();

  private obtain(
    id: string,
    texture: string,
    depth: number,
  ): Phaser.GameObjects.Sprite {
    this.used.add(id);
    let s = this.sprites.get(id) as Phaser.GameObjects.Sprite | undefined;
    if (!s) {
      s = this.add.sprite(0, 0, texture);
      s.setDepth(depth);
      this.sprites.set(id, s);
    }
    return s as Phaser.GameObjects.Sprite;
  }

  private render_(sim: Sim): void {
    this.used.clear();
    const t = sim.tick;

    // players
    for (const p of sim.players) {
      const baked = this.baked.get(castAachar(p.castId));
      if (!baked) continue;
      const texKey = `cast:${castAachar(p.castId)}`;
      if (p.ghost) {
        const g = p.ghost;
        const shell = this.obtain(`pghost${p.index}`, "bubble:ghost", 52);
        shell.setPosition(g.x, g.y).setScale((BUBBLE_R + 6) / 16).setAlpha(0.9);
        const face = this.obtain(`pghostface${p.index}`, texKey, 51);
        face.setTexture(texKey, String(baked.clips.hit?.start ?? 0));
        face.setPosition(g.x, g.y + baked.frameH * 0.28).setScale(0.55).setAlpha(0.8);
        face.setOrigin(baked.anchorX / baked.frameW, baked.groundY / baked.frameH);
        continue;
      }
      if (!p.alive) continue;
      const s = this.obtain(`p${p.index}`, texKey, 50);
      s.setOrigin(baked.anchorX / baked.frameW, baked.groundY / baked.frameH);
      s.setPosition(Math.round(p.x), Math.round(p.y));
      s.setFlipX(p.facing === 1); // baked art faces left
      const animKey = `${texKey}:${p.anim}`;
      if (s.anims.currentAnim?.key !== animKey && this.anims.exists(animKey)) {
        s.play(animKey);
      }
      const blink = p.invuln > 0 && Math.floor(t / 4) % 2 === 0;
      s.setAlpha(blink ? 0.35 : 1);
      if (p.prayer > 0) {
        s.setTintFill(0xfff2b0);
        if (t % 6 < 3) s.clearTint();
      } else if (p.frenzy && t % 14 < 3) {
        s.setTint(0xffe080);
      } else {
        s.clearTint();
      }
    }

    // bubbles
    for (const b of sim.bubbles) {
      const key = `b${b.id}`;
      const s = this.obtain(key, `bubble:p${b.owner}`, 40);
      const squish = b.state.kind === "launch" ? 0.85 : 1 + Math.sin((b.age + b.wobblePhase * 30) / 14) * 0.05;
      s.setPosition(Math.round(b.x), Math.round(b.y));
      s.setScale((BUBBLE_R / 16) * (b.state.kind === "launch" ? 1.1 : 1), (BUBBLE_R / 16) * squish);
      if (b.state.kind === "trapped") {
        s.setAlpha(0.95);
        // wobble faster as escape nears
        if (b.state.ticks < 90 && t % 10 < 5) s.setTint(0xff8080);
        else s.clearTint();
      } else {
        s.setAlpha(0.9);
        s.clearTint();
      }
    }

    // enemies
    for (const e of sim.enemies) {
      const spr = CRITTER_SPRITES[e.kind];
      if (!spr) continue;
      const key = `e${e.id}`;
      const s = this.obtain(key, `e:${e.kind}#0`, 45);
      const frames = spr.frames.length;
      s.setTexture(pixelFrameKey(`e:${e.kind}`, t + e.id * 7, frames, e.angry ? 8 : 14));
      s.setScale(spr.scale ?? 2);
      s.setOrigin(0.5, 1);
      if (e.phase.kind === "trapped") {
        s.setPosition(Math.round(e.x), Math.round(e.y));
        s.setScale((spr.scale ?? 2) * 0.8);
        s.setAngle(Math.sin((t + e.id * 13) / 12) * 14);
      } else if (e.phase.kind === "dying") {
        s.setPosition(Math.round(e.x), Math.round(e.y));
        s.setAngle(e.phase.ticks * 24);
        s.setAlpha(1 - e.phase.ticks / 30);
      } else {
        s.setPosition(Math.round(e.x), Math.round(e.y + 13));
        s.setAngle(0);
        s.setAlpha(1);
        s.setFlipX(e.facing === 1);
      }
      if (e.hitFlash > 0 && t % 4 < 2) s.setTintFill(0xffffff);
      else if (e.angry) s.setTint(0xff9070);
      else s.clearTint();
    }

    // projectiles
    for (const pr of sim.projectiles) {
      const spr = PROJECTILE_SPRITES[pr.kind];
      if (pr.kind === "twangring") {
        // rings render into zoneGfx below
        continue;
      }
      if (!spr) continue;
      const s = this.obtain(`pr${pr.id}`, `p:${pr.kind}#0`, 46);
      s.setTexture(pixelFrameKey(`p:${pr.kind}`, t + pr.id * 5, spr.frames.length, 8));
      s.setScale(spr.scale ?? 2);
      s.setOrigin(0.5, 0.5);
      s.setPosition(Math.round(pr.x), Math.round(pr.y));
      s.setFlipX(pr.vx > 0);
      if (pr.kind === "note") s.setTint(pr.hostile ? 0xff6040 : 0x80ffb0);
      else s.clearTint();
      if (pr.kind === "jug" || pr.kind === "book") s.setAngle((t + pr.id * 11) * 9);
      else s.setAngle(0);
    }

    // pets
    for (const pet of sim.pets) {
      const key = pet.kind === "granny" ? "granny_pet" : pet.kind;
      const spr = MISC_CRITTERS[key];
      if (!spr) continue;
      const s = this.obtain(`pet${pet.id}`, `m:${key}#0`, 47);
      s.setTexture(pixelFrameKey(`m:${key}`, t + pet.id * 3, spr.frames.length, 9));
      s.setScale(spr.scale ?? 2);
      s.setOrigin(0.5, 1);
      s.setPosition(Math.round(pet.x), Math.round(pet.y));
      s.setFlipX(pet.facing === 1);
      s.setAngle(pet.mode === 1 ? 90 : 0); // possum playing dead
    }

    // items
    for (const it of sim.items) {
      let tex = "";
      let scale = 2;
      if (it.kind === "food") tex = `f:${FOOD_TIERS[it.data].name}#0`;
      else if (it.kind === "jar") tex = pixelFrameKey("i:jar", t, 2, 16);
      else if (it.kind === "life") tex = pixelFrameKey("i:lifejug", t, 2, 16);
      else if (it.kind === "letter") tex = "i:letterbubble#0";
      if (!tex || !this.textures.exists(tex.split("#")[0] + "#0")) continue;
      const s = this.obtain(`it${it.id}`, tex, 42);
      s.setTexture(tex);
      s.setScale(scale);
      s.setOrigin(0.5, it.kind === "letter" ? 0.5 : 1);
      const bob = it.kind === "letter" || it.kind === "life" ? Math.sin((t + it.id * 19) / 20) * 3 : 0;
      s.setPosition(Math.round(it.x), Math.round(it.y + bob));
      // expiring blink
      s.setAlpha(it.ttl < 120 && t % 12 < 6 ? 0.4 : 1);
      if (it.kind === "jar") {
        const glow = this.obtain(`itg${it.id}`, "bubble:special", 41);
        glow.setPosition(Math.round(it.x), Math.round(it.y - 10));
        glow.setScale(1.3 + Math.sin(t / 9) * 0.12);
        glow.setAlpha(0.5);
        glow.setTint(it.forPlayer === 0 ? 0x9be8c8 : 0xf0c880);
      }
      if (it.kind === "letter") {
        const id = `itl${it.id}`;
        this.used.add(id);
        let txt = this.texts.get(id);
        if (!txt) {
          txt = this.add
            .text(0, 0, YEEHAW[it.data], {
              fontFamily: "'Press Start 2P', monospace",
              fontSize: "13px",
              color: "#ffd84a",
            })
            .setOrigin(0.5, 0.5)
            .setDepth(43);
          this.texts.set(id, txt);
        }
        txt.setPosition(Math.round(it.x), Math.round(it.y + bob));
        txt.setAlpha(it.ttl < 120 && t % 12 < 6 ? 0.4 : 1);
      }
    }

    // specials: gold bubble + icon
    for (const sp of sim.specials) {
      const shell = this.obtain(`sp${sp.id}`, "bubble:special", 44);
      shell.setPosition(Math.round(sp.x), Math.round(sp.y));
      shell.setScale(1.35 + Math.sin(sp.age / 16) * 0.06);
      shell.setAlpha(0.95);
      const icon = this.obtain(`spi${sp.id}`, `s:${sp.kind}#0`, 45);
      icon.setPosition(Math.round(sp.x), Math.round(sp.y));
      icon.setScale(1.6);
      icon.setOrigin(0.5, 0.5);
    }

    // hog
    if (sim.hog.active) {
      const spr = MISC_CRITTERS.hog;
      if (spr) {
        const s = this.obtain("hog", "m:hog#0", 48);
        s.setTexture(pixelFrameKey("m:hog", t, spr.frames.length, 6));
        s.setScale(spr.scale ?? 3);
        s.setOrigin(0.5, 1);
        s.setPosition(Math.round(sim.hog.x), Math.round(sim.hog.y));
        s.setFlipX(sim.hog.facing === 1);
      }
    }

    // revenuer
    if (sim.revenuer.active) {
      const spr = MISC_CRITTERS.revenuer;
      if (spr) {
        const s = this.obtain("rev", "m:revenuer#0", 60);
        s.setTexture(pixelFrameKey("m:revenuer", t, spr.frames.length, 12));
        s.setScale(spr.scale ?? 2);
        s.setOrigin(0.5, 0.5);
        s.setPosition(Math.round(sim.revenuer.x), Math.round(sim.revenuer.y));
        s.setFlipX(sim.revenuer.vx > 0);
        s.setAlpha(0.82 + Math.sin(t / 9) * 0.1);
      }
    }

    // boss
    if (sim.boss) {
      const spr = BOSS_SPRITES[sim.boss.id];
      if (spr) {
        const s = this.obtain("boss", `boss:${sim.boss.id}#0`, 49);
        s.setTexture(pixelFrameKey(`boss:${sim.boss.id}`, t, spr.frames.length, 16));
        s.setScale(spr.scale ?? 4);
        s.setOrigin(0.5, 0.5);
        s.setPosition(Math.round(sim.boss.x), Math.round(sim.boss.y));
        s.setFlipX(sim.boss.facing === 1);
        if (sim.boss.hitFlash > 0 && t % 4 < 2) s.setTintFill(0xffffff);
        else if (sim.boss.dead) s.setTint(0x707070);
        else s.clearTint();
        if (sim.boss.dead) s.setAngle(Math.sin(sim.boss.deathTicks / 5) * 8);
      }
      // boss HP bar
      this.bossBar.clear();
      if (!sim.boss.dead) {
        const w = 320;
        const x = FIELD_W / 2 - w / 2;
        this.bossBar.fillStyle(0x000000, 0.55);
        this.bossBar.fillRect(x - 3, 12, w + 6, 16);
        this.bossBar.fillStyle(0x8a2e1e);
        this.bossBar.fillRect(x, 15, w, 10);
        this.bossBar.fillStyle(0xff5030);
        this.bossBar.fillRect(x, 15, (w * sim.boss.hp) / sim.boss.maxHp, 10);
      }
    } else {
      this.bossBar.clear();
    }

    // zones + rings + wind hints
    this.zoneGfx.clear();
    for (const z of sim.zones) {
      if (z.kind === "fire") {
        const flicker = 0.75 + Math.sin(t / 3 + z.id) * 0.25;
        this.zoneGfx.fillStyle(0xff7a20, 0.75 * flicker);
        this.zoneGfx.fillRect(z.x, z.y - 8, z.w, z.h + 8);
        this.zoneGfx.fillStyle(0xffd040, 0.8 * flicker);
        for (let i = 0; i < z.w; i += 12) {
          const fh = 8 + ((i * 7 + t * 3 + z.id * 13) % 12);
          this.zoneGfx.fillTriangle(
            z.x + i, z.y + z.h - 6,
            z.x + i + 10, z.y + z.h - 6,
            z.x + i + 5, z.y - fh,
          );
        }
      } else {
        this.zoneGfx.fillStyle(0x8fd83a, 0.3 + Math.sin(t / 11 + z.id) * 0.08);
        this.zoneGfx.fillRoundedRect(z.x, z.y - z.h, z.w, z.h * 2, 14);
      }
    }
    for (const pr of sim.projectiles) {
      if (pr.kind !== "twangring") continue;
      const age = 40 - pr.ticks;
      const radius = 20 + age * 3.2;
      this.zoneGfx.lineStyle(4, 0xf0c860, Math.max(0, 1 - age / 40));
      this.zoneGfx.strokeCircle(pr.x, pr.y, radius);
      this.zoneGfx.lineStyle(2, 0xfff2c0, Math.max(0, 0.8 - age / 40));
      this.zoneGfx.strokeCircle(pr.x, pr.y, radius - 5);
    }
    for (const pr of sim.projectiles) {
      if (pr.kind !== "bolt") continue;
      const a = pr.ticks / 14;
      this.zoneGfx.lineStyle(3, 0xa0e0ff, a);
      let x = pr.x;
      let y = pr.y - 200;
      this.zoneGfx.beginPath();
      this.zoneGfx.moveTo(x, y);
      const segs = 6;
      for (let i = 1; i <= segs; i++) {
        x = pr.x + ((i % 2 === 0 ? -1 : 1) * 10 * (segs - i)) / segs;
        y = pr.y - 200 + (200 / segs) * i;
        this.zoneGfx.lineTo(x, y);
      }
      this.zoneGfx.strokePath();
    }

    // sweep unused sprites + texts
    for (const [id, s] of this.sprites) {
      if (!this.used.has(id)) {
        s.destroy();
        this.sprites.delete(id);
      }
    }
    for (const [id, s] of this.texts) {
      if (!this.used.has(id)) {
        s.destroy();
        this.texts.delete(id);
      }
    }
  }
}

// The cast lookup lives here to avoid circular imports with GameHost.
import { castById } from "../cast";
function castAachar(castId: string): string {
  return castById(castId).aachar;
}

export function createPhaserGame(
  parent: HTMLElement,
  hooks: PlaySceneHooks,
  baked: Map<string, BakedCharacter>,
): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: FIELD_W,
    height: FIELD_H,
    backgroundColor: "#120d08",
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [],
  });
  game.scene.add("play", PlayScene, true, { hooks, baked });
  return game;
}
