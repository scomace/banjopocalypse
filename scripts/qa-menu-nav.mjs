// Pointer-free menu QA: walks title -> scores -> settings -> online landing ->
// code entry -> select -> world -> game -> pause -> quit, then a quickstart
// run into the initials screen and the leaderboard, twice: once with the
// keyboard only (arrows / Enter / Esc, i.e. what a TV remote sends) and once
// with a fake gamepad only (d-pad / A / B / Start). Fails if any screen is
// unreachable without a mouse. Needs `vite --port 5200` (or QA_PORT).
// Usage: node scripts/qa-menu-nav.mjs [keyboard|pad|both]
import { chromium } from "playwright";

const PORT = process.env.QA_PORT ?? "5200";
const which = process.argv[2] ?? "both";
const failures = [];
const browser = await chromium.launch();

const FAKE_PAD = `
  const pad = {
    id: "QA Pad (STANDARD GAMEPAD)", index: 0, connected: true, mapping: "standard",
    timestamp: 0, axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  };
  navigator.getGamepads = () => [pad];
  window.__press = (b, ms = 90) => new Promise((res) => {
    pad.buttons[b].pressed = true; pad.buttons[b].value = 1;
    setTimeout(() => { pad.buttons[b].pressed = false; pad.buttons[b].value = 0; setTimeout(res, 60); }, ms);
  });
  window.__stick = (x, y, ms = 120) => new Promise((res) => {
    pad.axes[0] = x; pad.axes[1] = y;
    setTimeout(() => { pad.axes[0] = 0; pad.axes[1] = 0; setTimeout(res, 60); }, ms);
  });
`;

async function run(mode) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  if (mode === "pad") await page.addInitScript(FAKE_PAD);

  // one vocabulary for both devices
  const PAD = { up: 12, down: 13, left: 14, right: 15, accept: 0, back: 1, start: 9 };
  const KEY = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight", accept: "Enter", back: "Escape", start: "Enter" };
  const press = async (a, times = 1) => {
    for (let i = 0; i < times; i++) {
      if (mode === "pad") await page.evaluate((b) => window.__press(b), PAD[a]);
      else { await page.keyboard.press(KEY[a]); await page.waitForTimeout(120); }
    }
  };
  const see = async (text, label = text, ms = 4000) => {
    try {
      await page.getByText(text, { exact: false }).first().waitFor({ timeout: ms });
      console.log(`  [${mode}] ok   ${label}`);
    } catch {
      console.log(`  [${mode}] FAIL ${label}`);
      failures.push(`${mode}: ${label}`);
      await page.screenshot({ path: `qa-menu-${mode}-fail.png` });
    }
  };

  console.log(`== ${mode} pass`);
  await page.goto(`http://localhost:${PORT}/#/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await see("Banjopocalypse", "title");

  // title -> scores -> back
  await press("down", 2);
  await press("accept");
  await see("Holler Heroes", "scores screen");
  await press("back");
  await see("A MOONSHINE", "back on title");

  // title -> settings: nudge music, flip a toggle, back
  await press("down", 3);
  await press("accept");
  await see("Fixin's", "settings screen");
  await press("right");
  await press("down", 2);
  await press("accept"); // flip screen shake
  await press("back");
  await see("A MOONSHINE", "back on title (settings)");
  const shake = await page.evaluate(() => JSON.parse(localStorage.getItem("banjo/v1/settings") || "{}").screenShake);
  if (shake === false) console.log(`  [${mode}] ok   settings toggle flipped`);
  else { console.log(`  [${mode}] FAIL settings toggle`); failures.push(`${mode}: settings toggle`); }

  // title -> online landing -> join -> code entry -> back out
  await press("down", 1);
  await press("accept");
  await see("TWO HOLLERS", "online landing");
  await press("down");
  await press("accept");
  await see("SPELL THE 4-LETTER", "room code entry");
  await press("up"); // spin slot 0 -> A
  await press("right");
  await press("up", 2); // slot 1 -> B
  const code = await page.evaluate(() => [...document.querySelectorAll("[data-slot]")].map((b) => b.textContent?.trim()).join(""));
  if (code.startsWith("AB")) console.log(`  [${mode}] ok   code wheel spells ${code}`);
  else { console.log(`  [${mode}] FAIL code wheel (${code})`); failures.push(`${mode}: code wheel`); }
  await press("back", 3); // erase B, erase A, then leave the code entry
  await see("Host a Room", "back to landing");
  await press("back");
  await see("A MOONSHINE", "back on title (online)");

  // title -> select -> world -> game
  await press("accept");
  await see("Pick yer kinfolk", "select screen");
  await press("right");
  await press("accept"); // pick P1 (second cousin)
  await see("LOCKED IN", "P1 locked in");
  await press("accept"); // let's go
  await see("Where we startin'", "world select");
  await press("accept");
  await page.waitForTimeout(5000); // bake + mount
  try {
    await page.locator("canvas").first().waitFor({ timeout: 6000 });
    console.log(`  [${mode}] ok   in the game (canvas mounted)`);
  } catch {
    console.log(`  [${mode}] FAIL in the game`);
    failures.push(`${mode}: in the game`);
  }

  // pause -> quit -> confirm -> title (score 0 -> straight to title)
  if (mode === "pad") await press("start"); else await press("back");
  await see("Paused", "pause menu");
  await press("down", 3);
  await press("accept");
  await see("QUIT TO THE TITLE?", "quit confirm");
  await press("right");
  await press("accept");
  await see("A MOONSHINE", "quit landed on title");

  // quickstart: score some points with the dev clear, walk the intermission,
  // pause-quit into initials, carve a name, land on the board
  await page.goto(`http://localhost:${PORT}/?quickstart=1&cast=earl&level=1&seed=42#/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(4500);
  await page.keyboard.press("Digit9");
  await page.waitForTimeout(600);
  await page.keyboard.press("Digit0");
  await page.waitForTimeout(5400);
  await see("Pick yer poison", "intermission");
  await press("right");
  await press("accept");
  await page.waitForTimeout(3000);
  // make sure there's a score worth carving, whatever the cheat-clear paid out
  await page.evaluate(() => { window.__banjo.run.players[0].score += 1234; });
  if (mode === "pad") await press("start"); else await press("back");
  await see("Paused", "pause menu (quickstart)");
  await press("down", 3);
  await press("accept");
  await press("right");
  await press("accept");
  await see("Yer legend", "initials screen");
  if (mode === "pad") {
    await press("up"); // A
    await press("right");
    await press("up"); // A
    await press("right");
    await press("up", 2); // B
    await press("accept"); // full -> carve
  } else {
    await page.keyboard.type("s");
    await page.waitForTimeout(100);
    await press("up"); // slot 1 -> A
    await press("right");
    await press("up", 3); // slot 2 -> C
    await press("accept"); // full -> carve
  }
  await see("Holler Heroes", "leaderboard after carving");
  const want = mode === "pad" ? "AAB" : "SAC";
  await see(want, `initials ${want} on the board`);

  await page.screenshot({ path: `qa-menu-${mode}.png` });
  if (errors.length) {
    console.log(`  [${mode}] console errors:`);
    for (const e of [...new Set(errors)].slice(0, 8)) console.log("    " + e.slice(0, 300));
    failures.push(`${mode}: console errors`);
  }
  await page.close();
}

if (which === "keyboard" || which === "both") await run("keyboard");
if (which === "pad" || which === "both") await run("pad");
await browser.close();
if (failures.length) {
  console.error("MENU NAV QA FAILED:\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log("menu nav QA: every screen reachable without a pointer");
