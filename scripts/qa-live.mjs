import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("https://banjopocalypse.pages.dev/?quickstart=1&cast=granny&level=23&seed=9#/", { waitUntil: "networkidle" });
await page.waitForTimeout(6000);
const key = (k, ms) => page.keyboard.down(k).then(() => page.waitForTimeout(ms)).then(() => page.keyboard.up(k));
for (let i = 0; i < 4; i++) { await key("d", 400); await page.keyboard.press("g"); await key("f", 250); await key("a", 300); await page.keyboard.press("g"); }
await page.screenshot({ path: "qa-live.png" });
await browser.close();
console.log(errors.length ? "ERRORS: " + [...new Set(errors)].slice(0,5).join(" | ") : "LIVE OK, no console errors");
