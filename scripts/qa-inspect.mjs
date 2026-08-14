import { chromium } from "playwright";
const PORT = process.env.QA_PORT ?? "5200";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://localhost:${PORT}/?quickstart=1&cast=earl&level=11&seed=42#/`, { waitUntil: "networkidle" });
await page.waitForTimeout(5000);
const info = await page.evaluate(() => {
  const c = window.__banjo;
  return c ? { levelIndex: c.run.levelIndex, isBoss: c.sim.isBoss, world: c.sim.world.name, boss: c.sim.boss?.name ?? null } : "no controller";
});
console.log(JSON.stringify(info));
await browser.close();
