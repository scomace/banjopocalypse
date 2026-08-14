import { chromium } from "playwright";
const PORT = process.env.QA_PORT ?? "5200";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://localhost:${PORT}/?quickstart=1&cast=earl&level=11&seed=42#/`, {
  waitUntil: "networkidle",
});
await page.waitForTimeout(1000);
const info = await page.evaluate(() => ({
  href: window.location.href,
  search: window.location.search,
  hash: window.location.hash,
}));
console.log(JSON.stringify(info, null, 2));
await browser.close();
