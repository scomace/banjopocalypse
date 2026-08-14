// Full-flow QA: clear a level with the dev cheat, walk the intermission,
// pick a card, land in the next level. Screenshots each beat.
// Usage: node scripts/qa-flow.mjs [level] [prefix]
import { chromium } from "playwright";

const [, , level = "1", prefix = "qa-flow"] = process.argv;
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
await page.waitForTimeout(4500);

// let it play a moment, then cheat-clear
await page.keyboard.press("Digit9"); // frenzy on
await page.waitForTimeout(1500);
await page.screenshot({ path: `${prefix}-1-frenzy.png` });
await page.keyboard.press("Digit0"); // clear
await page.waitForTimeout(1200);
await page.screenshot({ path: `${prefix}-2-clearing.png` });
// wait through celebration (3s) into intermission
await page.waitForTimeout(4200);
await page.screenshot({ path: `${prefix}-3-intermission.png` });
// pick middle card: right then confirm
await page.keyboard.press("KeyD");
await page.waitForTimeout(250);
await page.keyboard.press("KeyF");
await page.waitForTimeout(1200);
await page.screenshot({ path: `${prefix}-4-nextlevel.png` });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${prefix}-5-play.png` });
await browser.close();

if (errors.length) {
  console.log("CONSOLE ERRORS:");
  for (const e of [...new Set(errors)].slice(0, 15)) console.log("  " + e.slice(0, 400));
} else {
  console.log("no console errors");
}
