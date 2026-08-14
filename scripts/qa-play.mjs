// Headless gameplay QA: quickstart a run, drive Earl with real key events,
// screenshot the action at intervals.
// Usage: node scripts/qa-play.mjs [level] [prefix] [seconds]
import { chromium } from "playwright";

const [, , level = "1", prefix = "qa-play", seconds = "18"] = process.argv;
const PORT = process.env.QA_PORT ?? "5200";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(
  `http://localhost:${PORT}/?quickstart=1&cast=earl&level=${level}&seed=42#/`,
  { waitUntil: "networkidle" },
);
// wait for bake + level intro
await page.waitForTimeout(4500);
await page.screenshot({ path: `${prefix}-1-start.png` });

// drive: run right blowing bubbles, hop around, reverse
const key = (k, ms) =>
  page.keyboard.down(k).then(() => page.waitForTimeout(ms)).then(() => page.keyboard.up(k));

const endAt = Date.now() + Number(seconds) * 1000;
let shot = 2;
let nextShot = Date.now() + 5000;
while (Date.now() < endAt) {
  await key("d", 500);
  await page.keyboard.press("g");
  await page.waitForTimeout(120);
  await page.keyboard.press("g");
  await key("f", 260);
  await key("d", 350);
  await page.keyboard.press("g");
  await key("a", 600);
  await page.keyboard.press("g");
  await page.waitForTimeout(140);
  await key("f", 250);
  await page.keyboard.press("g");
  if (Date.now() > nextShot && shot <= 4) {
    await page.screenshot({ path: `${prefix}-${shot}-t${Math.round((Date.now() - endAt + Number(seconds) * 1000) / 1000)}s.png` });
    shot++;
    nextShot = Date.now() + 5000;
  }
}
await page.screenshot({ path: `${prefix}-final.png` });
await browser.close();

if (errors.length) {
  console.log("CONSOLE ERRORS:");
  for (const e of [...new Set(errors)].slice(0, 15)) console.log("  " + e.slice(0, 400));
} else {
  console.log("no console errors");
}
