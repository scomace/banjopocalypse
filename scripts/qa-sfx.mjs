// Headless QA for the SFX mixer (/admin/sfx): loads the page, measures every
// sound offline, prints the table, nudges one trim, saves through the vite
// plugin and checks the page survives the save. Needs the dev server on 5199.
//   node scripts/qa-sfx.mjs [screenshot.png]

import { chromium } from "playwright";

const URL = "http://localhost:5199/#/admin/sfx";
const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text());
});
await page.goto(URL);
await page.waitForSelector("text=SFX mixer", { timeout: 20000 });
await page.waitForSelector("text=dev server: save enabled", { timeout: 10000 });
const rowCount = await page.locator("tbody tr").count();
console.log("rows:", rowCount);

// measure all
await page.click("text=Measure all");
await page.waitForFunction(
  () => document.body.innerText.includes("measured ") && document.body.innerText.includes("sound(s)"),
  null,
  { timeout: 120000 },
);
console.log("status:", await page.locator("header >> text=/measured \\d+ sound/").first().innerText());

// dump per-row measurements
const rows = await page.$$eval("tbody tr", (trs) =>
  trs.map((tr) => {
    const tds = tr.querySelectorAll("td");
    return {
      name: tds[1].innerText.trim().replace(/•$/, "").trim(),
      trimDb: tds[4].querySelector("input").value,
      meter: tds[6].innerText.trim(),
      sug: tds[7].innerText.trim(),
    };
  }),
);
for (const r of rows) console.log(r.name.padEnd(16), r.meter.padEnd(20), r.sug);

// nudge the first row, save, then put it back and save again so the repo is
// left as it was
const firstRow = page.locator("tbody tr").first();
const numInput = firstRow.locator("input[type=number]");
const original = await numInput.inputValue();
const saveBtn = page.locator("header button", { hasText: /^Save/ });
async function setAndSave(value) {
  await numInput.fill(value);
  await numInput.dispatchEvent("input");
  await page.waitForTimeout(200);
  console.log("save label:", await saveBtn.innerText());
  await saveBtn.click();
  await page.waitForFunction(() => document.body.innerText.includes("saved src/game/audio/sfx-trim.json"), null, {
    timeout: 10000,
  });
  await page.waitForTimeout(1500);
  console.log("after save, title still there:", await page.locator("text=SFX mixer").count());
  console.log("dirty after save:", await page.locator("header button", { hasText: /^Revert/ }).innerText());
}
await setAndSave(String(Number(original) - 3));
await setAndSave(original);
await page.screenshot({ path: process.argv[2] ?? "qa-sfx.png", fullPage: false });
console.log("errors:", errors);
await browser.close();
