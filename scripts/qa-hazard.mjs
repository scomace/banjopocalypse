// Headless QA for the Holler Hazards. Pins one hazard with ?hazard=, plays a
// stretch of a real level in the browser, and asserts the hazard actually did
// its thing: the intro banner, the HUD tag, and the entities or modulation
// each hazard is supposed to produce.
// Usage: node scripts/qa-hazard.mjs [hazard|all] [prefix=qa-hazard]
// Needs a dev server: npx vite --port 5200
import { chromium } from "playwright";

const [, , which = "all", prefix = "qa-hazard"] = process.argv;
const PORT = process.env.QA_PORT ?? "5200";

// What each hazard has to prove within the sample window. `probe` reads the
// live sim; `ok` decides. Kept out of the sim itself so QA never shapes design.
const CHECKS = {
  // ~10 s between jars by design, so this one needs a longer look
  overflow: { level: 14, secs: 26, want: "jars keep landing", ok: (s) => s.jarsSeen >= 2 },
  henhouse: { level: 14, want: "hens crossing", ok: (s) => s.chickensSeen >= 3 },
  hogwild: { level: 14, want: "a hog stampede", ok: (s) => s.hogSeen },
  gasleak: { level: 14, want: "skunk clouds blooming", ok: (s) => s.zonesSeen >= 2 },
  drylightnin: { level: 40, want: "bolts striking", ok: (s) => s.boltsSeen >= 1 },
  fulllungs: { level: 14, want: "wind pegged full through repeated air specials", ok: (s) => s.airSpecials >= 3 && s.windMin >= 5 },
  ornery: { level: 14, want: "every varmint angry", ok: (s) => s.start.angry > 0 && s.start.angry === s.start.enemies },
  earlybird: { level: 14, want: "an early revenuer deadline", ok: (s) => s.start.hurryTick <= 18 * 60 },
  greased: { level: 14, want: "the hazard live (friction is felt, not counted)", ok: (s) => s.hazard === "greased" },
  thinair: { level: 14, want: "the hazard live (gravity is felt, not counted)", ok: (s) => s.hazard === "thinair" },
};

const ids = which === "all" ? Object.keys(CHECKS) : [which];
// QA_CHROMIUM lets a sandbox point at a preinstalled browser build.
const browser = await chromium.launch(
  process.env.QA_CHROMIUM
    ? { executablePath: process.env.QA_CHROMIUM, args: ["--no-sandbox"] }
    : {},
);
let failures = 0;

for (const id of ids) {
  const check = CHECKS[id];
  if (!check) {
    console.log(`FAIL ${id}: unknown hazard`);
    failures++;
    continue;
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(
    `http://localhost:${PORT}/?quickstart=1&cast=earl&level=${check.level}&seed=7&hazard=${id}#/`,
    { waitUntil: "networkidle" },
  );
  await page.waitForFunction(() => !!window.__banjo?.sim, null, { timeout: 30000 });

  // Snapshot the level as it opens. Spawn-time facts (the angry roster, the
  // revenuer deadline) and the HUD tag have to be read while the level is
  // still running: the input bot may clear it or lose it before the sample
  // window ends, and neither outcome says anything about the hazard.
  const start = await page.evaluate(() => {
    const s = window.__banjo.sim;
    return {
      hurryTick: s.hurryTick,
      angry: s.enemies.filter((e) => e.angry).length,
      enemies: s.enemies.length,
    };
  });

  // the banner rides the level-intro card, so grab it before it fades
  const bannerSeen = await page
    .locator("[data-hazard], .font-display")
    .filter({ hasText: /HOG WILD|GREASED|THIN AIR|ORNERY|OVERFLOWIN|CHICKEN TRUCK|FULL LUNGS|GAS LEAK|DRY LIGHTNIN|REVENUER/i })
    .first()
    .isVisible()
    .catch(() => false);
  await page.screenshot({ path: `${prefix}-${id}-intro.png` });
  const hudTag = await page.locator("[data-hazard]").first().innerText().catch(() => "");

  // Install a page-side sampler, then drive real input from here while it
  // runs: the player has to actually move and jump or hazards like FULL LUNGS
  // (wind never drains) would pass without ever being exercised.
  await page.evaluate(() => {
    const acc = {
      jarsSeen: 0, chickensSeen: 0, boltsSeen: 0, zonesSeen: 0,
      hogSeen: false, windMin: 99, airSpecials: 0,
    };
    const seen = new Set();
    let wasAir = false;
    const count = (arr, key, bucket) => {
      for (const o of arr) {
        if (o.kind !== key || seen.has(o.id)) continue;
        seen.add(o.id);
        acc[bucket]++;
      }
    };
    window.__qa = acc;
    window.__qaTimer = setInterval(() => {
      const s = window.__banjo.sim;
      count(s.items, "jar", "jarsSeen");
      count(s.projectiles, "chicken", "chickensSeen");
      count(s.projectiles, "bolt", "boltsSeen");
      count(s.zones, "skunk", "zonesSeen");
      if (s.hog.active) acc.hogSeen = true;
      for (const p of s.players) {
        acc.windMin = Math.min(acc.windMin, p.wind);
        if (p.airJumpUsed && !wasAir) acc.airSpecials++;
        wasAir = p.airJumpUsed;
      }
    }, 50);
  });

  // hollering about: run, jump, double-jump, belch (~0.3 s per pass)
  for (let i = 0; i < Math.round((check.secs ?? 9) / 0.3); i++) {
    const dir = i % 4 < 2 ? "KeyD" : "KeyA";
    await page.keyboard.down(dir);
    await page.keyboard.press("KeyF"); // jump
    await page.waitForTimeout(90);
    await page.keyboard.press("KeyF"); // air special
    await page.keyboard.press("KeyG"); // blow
    await page.waitForTimeout(120);
    await page.keyboard.up(dir);
    await page.waitForTimeout(90);
  }

  const sample = await page.evaluate(() => {
    clearInterval(window.__qaTimer);
    const s = window.__banjo.sim;
    return {
      ...window.__qa,
      hazard: s.hazard,
      tick: s.tick,
      status: s.status,
    };
  });
  sample.start = start;

  await page.screenshot({ path: `${prefix}-${id}-play.png` });
  await page.close();

  const problems = [];
  if (sample.hazard !== id) problems.push(`sim says hazard=${sample.hazard}`);
  if (!bannerSeen) problems.push("no intro banner");
  if (!/x1\.25/.test(hudTag)) problems.push(`HUD tag reads "${hudTag}"`);
  if (!check.ok(sample)) problems.push(`no ${check.want}`);
  if (errors.length) problems.push(`page errors: ${errors.slice(0, 2).join(" | ")}`);

  if (problems.length) {
    failures++;
    console.log(`FAIL ${id}: ${problems.join("; ")}`);
    console.log(`      ${JSON.stringify(sample)}`);
  } else {
    console.log(`ok   ${id}: ${check.want} (tick ${sample.tick}, ${JSON.stringify(sample)})`);
  }
}

await browser.close();
if (failures) {
  console.log(`\nHAZARD QA: ${failures} FAILURES`);
  process.exit(1);
}
console.log("\nHAZARD QA: ALL GREEN");
