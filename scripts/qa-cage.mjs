// Headless QA for rescue cages: quickstart on a cage level, wait for the caged
// cousin's first holler balloon and screenshot it (full + a 2x close-up of the
// rig), park P1 on the bars until the padlock pops, screenshot the rescue and
// the jog-off, then confirm the save picked up `castRescued`.
// Usage: node scripts/qa-cage.mjs [level=4] [prefix=qa-cage] [cast=earl]
//   cage levels: 4 granny · 17 bobbiesue · 30 cooter · 39 darlene · 52 buford · 86 zeke
import { chromium } from "playwright";

const [, , level = "4", prefix = "qa-cage", cast = "earl"] = process.argv;
const PORT = process.env.QA_PORT ?? "5200";
const VW = 1280;
const VH = 760;
const FIELD_W = 960;
const FIELD_H = 544;
// the canvas letterboxes to the viewport width; world -> screen
const S = VW / FIELD_W;
const OY = (VH - FIELD_H * S) / 2;
const toScreen = (x, y) => ({ x: x * S, y: y * S + OY });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 2 });
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") errors.push(`[${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(`http://localhost:${PORT}/?quickstart=1&cast=${cast}&level=${level}&seed=42#/`, {
  waitUntil: "networkidle",
});
await page.waitForTimeout(2500);

const before = await page.evaluate(() => {
  const c = window.__banjo;
  const s = c.sim;
  return {
    status: s.status,
    tick: s.tick,
    cage: s.cage && { cast: s.cage.castId, x: s.cage.x, y: s.cage.y, hits: s.cage.hits, open: s.cage.openedTick },
  };
});
console.log("before:", JSON.stringify(before));
if (!before.cage) {
  console.log("no cage on this level; done");
  await browser.close();
  process.exit(1);
}
const cg = before.cage;
const clip = (() => {
  const c = toScreen(cg.x, cg.y);
  return { x: Math.max(0, c.x - 110), y: Math.max(0, c.y - 150), width: 220, height: 185 };
})();

// first holler: wait for the cage balloon to show up, then shoot
await page.waitForSelector('[data-balloon="9"]', { timeout: 9000 }).catch(() => null);
await page.waitForTimeout(250);
await page.screenshot({ path: `${prefix}-1-caged.png` });
await page.screenshot({ path: `${prefix}-1-caged-zoom.png`, clip });

// park P1 on the bars every frame until the lock pops (the sim moves him, we move him back),
// pausing a beat between hits so the chipped padlock frames are visible
const popped = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const c = window.__banjo;
      const t0 = performance.now();
      const tickFn = () => {
        const s = c.sim;
        const cg = s.cage;
        if (!cg) return resolve({ ok: false, why: "no cage" });
        if (cg.openedTick >= 0) return resolve({ ok: true, tick: s.tick, hits: cg.hits });
        if (performance.now() - t0 > 15000) return resolve({ ok: false, why: "timeout", hits: cg.hits });
        const p = s.players[0];
        if (p && s.status === "play") {
          p.x = cg.x;
          p.y = cg.y;
          p.vx = 0;
          p.vy = 0;
          p.invuln = 30; // don't let a wandering possum end the photo shoot
        }
        requestAnimationFrame(tickFn);
      };
      requestAnimationFrame(tickFn);
    }),
);
console.log("pop:", JSON.stringify(popped));
await page.waitForTimeout(120);
await page.screenshot({ path: `${prefix}-2-popped-zoom.png`, clip });
await page.waitForTimeout(800);
await page.screenshot({ path: `${prefix}-3-line.png` });
await page.waitForTimeout(900);
await page.screenshot({ path: `${prefix}-4-jog-zoom.png`, clip: { ...clip, width: 420 } });

const after = await page.evaluate(() => {
  const c = window.__banjo;
  return {
    status: c.sim.status,
    cage: c.sim.cage && { hits: c.sim.cage.hits, open: c.sim.cage.openedTick },
    score: c.run.players[0].score,
    save: JSON.parse(localStorage.getItem("banjo/v1/save") ?? "null"),
  };
});
console.log("after:", JSON.stringify(after));
await browser.close();

const real = errors.filter((e) => !/GL Driver|React Router|AudioContext/.test(e));
if (real.length) {
  console.log("CONSOLE:");
  for (const e of real.slice(0, 20)) console.log("  " + e.slice(0, 300));
} else {
  console.log("no console errors/warnings");
}
