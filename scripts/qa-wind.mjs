// Browser QA for wind (air-special stamina): Earl mashes jump for ~12s in a
// quickstart level, the HUD wind pips must drain, at least one gassed press
// must stumble (windFail sfx in the fx log), and the page must stay error
// free. Screenshot lands in qa-wind.png. Needs `vite --port 5200`.
import { chromium } from "playwright";
const PORT = process.env.QA_PORT ?? "5200";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`http://localhost:${PORT}/?quickstart=1&cast=earl&level=1&seed=7#/`, { waitUntil: "networkidle" });
await page.waitForTimeout(4500);
// tap the audio context awake and start counting wind events
await page.mouse.click(640, 380);
await page.evaluate(() => {
  const c = window.__banjo;
  window.__windLog = { fails: 0, strains: 0, minWind: 99 };
  const orig = c.audio?.handleFx?.bind(c.audio);
  if (orig) {
    c.audio.handleFx = (events) => {
      for (const e of events) {
        if (e.t === "sfx" && e.name === "windFail") window.__windLog.fails++;
        if (e.t === "sfx" && e.name === "windStrain") window.__windLog.strains++;
      }
      return orig(events);
    };
  }
});
const key = (k, ms) => page.keyboard.down(k).then(() => page.waitForTimeout(ms)).then(() => page.keyboard.up(k));
let snapped = false;
for (let i = 0; i < 70; i++) {
  await key("f", 40);
  await page.waitForTimeout(110);
  const w = await page.evaluate(() => {
    const p = window.__banjo.sim.players[0];
    window.__windLog.minWind = Math.min(window.__windLog.minWind, p.wind);
    return { wind: p.wind, stumble: p.stumbleTicks };
  });
  if (!snapped && w.stumble > 0) {
    await page.screenshot({ path: "qa-wind.png" });
    snapped = true;
  }
}
if (!snapped) await page.screenshot({ path: "qa-wind.png" });
const info = await page.evaluate(() => {
  const c = window.__banjo;
  const p = c.sim.players[0];
  const pips = [...document.querySelectorAll("[data-windpip]")].map((el) => el.style.opacity);
  return { wind: p.wind, alive: p.alive, log: window.__windLog, pips, windRowShown: document.querySelector("[data-wind]")?.style.display };
});
console.log(JSON.stringify(info));
await browser.close();
const bad = [];
if (info.log.minWind !== 0) bad.push(`meter never emptied (min ${info.log.minWind})`);
if (info.windRowShown !== "flex") bad.push(`wind row not shown (${info.windRowShown})`);
if (snapped === false) bad.push("no stumble observed");
if (errors.length) bad.push("console errors: " + errors.slice(0, 5).join(" | "));
console.log(bad.length ? "QA-WIND FAIL: " + bad.join("; ") : "QA-WIND OK (stumble screenshot: qa-wind.png)");
process.exit(bad.length ? 1 : 0);
