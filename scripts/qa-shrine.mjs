// Headless QA for the weapon shrine: quickstart on a shrine level, screenshot
// the pedestals + guardians, claim via the dev key (8), screenshot the
// WEAPON ACQUIRED card, dismiss, screenshot the test-drive frenzy.
// Usage: node scripts/qa-shrine.mjs [level=5] [prefix=qa-shrine] [cast=earl]
import { chromium } from "playwright";

const [, , level = "5", prefix = "qa-shrine", cast = "earl"] = process.argv;
const PORT = process.env.QA_PORT ?? "5200";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") errors.push(`[${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(`http://localhost:${PORT}/?quickstart=1&cast=${cast}&level=${level}&seed=42#/`, {
  waitUntil: "networkidle",
});
await page.waitForTimeout(4500);
await page.screenshot({ path: `${prefix}-1-shrine.png` });

const state = await page.evaluate(() => {
  const c = window.__banjo;
  const s = c.sim;
  return {
    shrine: s.shrine && { x: s.shrine.x, y: s.shrine.y, gifts: s.shrine.gifts, guardians: s.shrine.guardianIds.length },
    weapons: c.run.players[0].loadout.weapons,
    leashed: s.enemies.filter((e) => e.leash).map((e) => `${e.kind}@${Math.round(e.x)},${Math.round(e.y)}`),
  };
});
console.log("before:", JSON.stringify(state));

await page.keyboard.press("Digit8");
await page.waitForTimeout(1400);
await page.screenshot({ path: `${prefix}-2-acquired.png` });
const mid = await page.evaluate(() => {
  const c = window.__banjo;
  return { held: c.held, weapons: c.run.players[0].loadout.weapons, frenzy: c.sim.players[0].frenzy?.weapon ?? null, taken: c.sim.shrine?.taken };
});
console.log("during reveal:", JSON.stringify(mid));

await page.keyboard.press("Space");
await page.waitForTimeout(900);
await page.screenshot({ path: `${prefix}-3-frenzy.png` });
const after = await page.evaluate(() => {
  const c = window.__banjo;
  return { held: c.held, frenzy: c.sim.players[0].frenzy?.weapon ?? null, status: c.sim.status, tick: c.sim.tick };
});
console.log("after:", JSON.stringify(after));
await browser.close();

if (errors.length) {
  console.log("CONSOLE:");
  for (const e of errors.slice(0, 20)) console.log("  " + e.slice(0, 300));
} else {
  console.log("no console errors/warnings");
}
