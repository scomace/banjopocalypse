// Replay QA: mash real keyboard input in a co-op quickstart, then ask the
// page to re-run its own recorded input log through a fresh headless sim —
// verifyReplayNow() must land on the identical state hash (tick-perfect).
// Needs `vite --port 5200` (or QA_PORT). No dev-cheat digits here: those
// mutate the sim outside the input stream and rightly fail verification.
import { chromium } from "playwright";
const PORT = process.env.QA_PORT ?? "5200";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`http://localhost:${PORT}/?quickstart=1&cast=earl&cast2=buford&level=3&seed=11#/`, { waitUntil: "networkidle" });
await page.waitForTimeout(5000);
const key = (k, ms) => page.keyboard.down(k).then(() => page.waitForTimeout(ms)).then(() => page.keyboard.up(k));
for (let i = 0; i < 5; i++) {
  await Promise.all([key("d", 350), key("ArrowLeft", 350)]);
  await page.keyboard.press("g");
  await page.keyboard.press("l");
  await Promise.all([key("f", 250), key("ArrowUp", 250)]);
  await Promise.all([key("a", 300), key("ArrowRight", 300)]);
  // buford's line: jump, then press JUMP again midair (held a beat = short swing)
  await key("k", 120);
  await page.waitForTimeout(80);
  await key("k", 400);
}
const result = await page.evaluate(() => {
  const c = window.__banjo;
  const v = c.verifyReplayNow();
  return { ...v, logTicks: c.sim.tick };
});
console.log(JSON.stringify(result));
await browser.close();
if (!result.ok) { console.error("REPLAY VERIFY FAILED"); process.exit(1); }
console.log(errors.length ? "ERRORS: " + errors.slice(0, 5).join(" | ") : "no console errors; replay tick-perfect");
