// Headless QA: open a route, collect console errors, screenshot.
// Usage: node scripts/qa-shot.mjs <path> <outfile> [waitMs] [width] [height]
import { chromium } from "playwright";

const [, , route = "/", out = "qa.png", waitMs = "4000", w = "1400", h = "1000"] =
  process.argv;
const PORT = process.env.QA_PORT ?? "5200";

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: Number(w), height: Number(h) },
});
const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (err) => errors.push(String(err)));

await page.goto(`http://localhost:${PORT}/#${route}`, { waitUntil: "networkidle" });
await page.waitForTimeout(Number(waitMs));
await page.screenshot({ path: out, fullPage: false });
await browser.close();

if (errors.length) {
  console.log("CONSOLE ERRORS:");
  for (const e of errors.slice(0, 20)) console.log("  " + e.slice(0, 300));
} else {
  console.log("no console errors");
}
