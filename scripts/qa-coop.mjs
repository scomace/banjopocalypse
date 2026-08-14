import { chromium } from "playwright";
const PORT = process.env.QA_PORT ?? "5200";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`http://localhost:${PORT}/?quickstart=1&cast=earl&cast2=granny&level=2&seed=7#/`, { waitUntil: "networkidle" });
await page.waitForTimeout(5000);
const key = (k, ms) => page.keyboard.down(k).then(() => page.waitForTimeout(ms)).then(() => page.keyboard.up(k));
for (let i = 0; i < 6; i++) {
  await Promise.all([key("d", 400), key("ArrowLeft", 400)]);
  await page.keyboard.press("g");
  await page.keyboard.press("l");
  await page.waitForTimeout(150);
  await Promise.all([key("f", 250), key("ArrowUp", 250)]);
  await Promise.all([key("a", 300), key("ArrowRight", 300)]);
  await page.keyboard.press("g");
  await page.keyboard.press("l");
}
await page.screenshot({ path: "qa-coop.png" });
const info = await page.evaluate(() => {
  const c = window.__banjo;
  return { players: c.sim.players.map(p => ({ cast: p.castId, alive: p.alive, x: Math.round(p.x), lives: p.livesLeft })), bubbles: c.sim.bubbles.length, enemies: c.sim.enemies.length };
});
console.log(JSON.stringify(info));
await browser.close();
console.log(errors.length ? "ERRORS: " + errors.slice(0,5).join(" | ") : "no console errors");
