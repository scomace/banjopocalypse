// Headless QA for Buford's Fishin' Line: quickstart as Buford, jump then
// press JUMP again midair to cast (held = swing), screenshot mid-swing.
import { chromium } from "playwright";
const PORT = process.env.QA_PORT ?? "5200";
const OUT = process.env.QA_OUT ?? ".";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`http://localhost:${PORT}/?quickstart=1&cast=buford&level=1&seed=42#/`, { waitUntil: "networkidle" });
await page.waitForTimeout(4500);
const tapJump = async () => {
  await page.keyboard.down("f");
  await page.waitForTimeout(80);
  await page.keyboard.up("f");
};
await tapJump(); // ground jump
await page.waitForTimeout(120); // rising
await page.keyboard.down("f"); // midair press: cast; keep held to swing
await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/qa-hook-1-cast.png` });
await page.waitForTimeout(450);
await page.screenshot({ path: `${OUT}/qa-hook-2-swing.png` });
await page.keyboard.down("d");
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/qa-hook-3-pump.png` });
await page.keyboard.up("f"); // release: let fly
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/qa-hook-4-release.png` });
await page.keyboard.up("d");
for (let i = 0; i < 6; i++) {
  await tapJump();
  await page.waitForTimeout(150);
  await page.keyboard.down("f"); await page.waitForTimeout(600); await page.keyboard.up("f");
  await page.waitForTimeout(300);
}
await page.screenshot({ path: `${OUT}/qa-hook-5-later.png` });
await browser.close();
console.log(errors.length ? "CONSOLE ERRORS:\n" + [...new Set(errors)].slice(0, 10).join("\n") : "no console errors");
