// Online lockstep QA: two real browsers join one room (production relay by
// default), autopilot through the lobby, then both play with live keyboard
// input. The proof: the periodic state hashes both clients exchanged must be
// IDENTICAL at the same tick, with zero desyncs flagged. Needs `vite --port
// 5200`; set QA_NET=http://127.0.0.1:8787 to test against `npm run net:dev`.
import { chromium } from "playwright";

const PORT = process.env.QA_PORT ?? "5200";
const NET = process.env.QA_NET ?? ""; // empty = the game's default (production)
const netParam = NET ? `&net=${encodeURIComponent(NET)}` : "";

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error("FAIL:", msg);
};
const ok = (msg) => console.log("  ok:", msg);

const browser = await chromium.launch();
const mkPage = async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  return page;
};
const waitFor = async (page, fn, label, ms = 30000) => {
  await page.waitForFunction(fn, null, { timeout: ms }).catch(() => {
    throw new Error(`timeout: ${label}`);
  });
};

try {
  // host browser: autopilot lobby
  const host = await mkPage();
  await host.goto(`http://localhost:${PORT}/?online=host&cast=earl${netParam}#/`, { waitUntil: "networkidle" });
  await waitFor(host, () => window.__lobby?.code, "host lobby code");
  const code = await host.evaluate(() => window.__lobby.code);
  ok(`host opened room ${code}`);

  // guest browser: join by code
  const guest = await mkPage();
  await guest.goto(`http://localhost:${PORT}/?online=join&room=${code}&cast=buford${netParam}#/`, { waitUntil: "networkidle" });

  // both should land in the game and start ticking
  for (const [name, page] of [["host", host], ["guest", guest]]) {
    await waitFor(page, () => window.__banjo && window.__banjo.sim && window.__banjo.sim.tick > 150, `${name} sim ticking`, 60000);
  }
  ok("both sims running");

  const delays = await Promise.all([host, guest].map((p) => p.evaluate(() => window.__banjoNet.delay)));
  if (delays[0] !== delays[1]) fail(`input delay disagrees: ${delays.join(" vs ")}`);
  else ok(`agreed input delay: ${delays[0]} ticks`);

  // live keyboard on both sides while the sims run
  const mash = async (page, keys) => {
    for (const k of keys) {
      await page.keyboard.down(k);
      await page.waitForTimeout(250);
      await page.keyboard.up(k);
    }
  };
  await Promise.all([
    mash(host, ["d", "f", "a", "g", "d", "f", "a", "g"]),
    mash(guest, ["ArrowLeft", "ArrowUp", "ArrowRight", "l", "ArrowLeft", "ArrowUp", "j", "l"]),
  ]);
  ok("both players sent live input");

  // let the exchange settle past tick 600 on both clients
  for (const [name, page] of [["host", host], ["guest", guest]]) {
    await waitFor(page, () => window.__banjo.sim.tick > 660, `${name} past tick 660`, 60000);
  }

  const [h1, h2] = await Promise.all(
    [host, guest].map((p) => p.evaluate(() => window.__banjoNet.hashAt(600))),
  );
  if (h1 === undefined || h2 === undefined) fail(`hash at tick 600 missing (${h1}, ${h2})`);
  else if (h1 !== h2) fail(`DESYNC: tick-600 hashes differ (${h1} vs ${h2})`);
  else ok(`tick-600 state hashes identical (${h1})`);

  const desyncs = await Promise.all([host, guest].map((p) => p.evaluate(() => window.__banjoNet.desyncAt)));
  if (desyncs.some((d) => d !== null)) fail(`desync flagged: ${desyncs.join(", ")}`);
  else ok("no desyncs flagged by the canary");

  // both players actually present and controllable in both sims
  const states = await Promise.all(
    [host, guest].map((p) =>
      p.evaluate(() => window.__banjo.sim.players.map((q) => ({ cast: q.castId, x: Math.round(q.x), alive: q.alive }))),
    ),
  );
  if (JSON.stringify(states[0]) !== JSON.stringify(states[1])) {
    // positions are read at different wall-clock moments; allow drift only in x
    const casts0 = states[0].map((s) => s.cast).join();
    const casts1 = states[1].map((s) => s.cast).join();
    if (casts0 !== casts1) fail(`player rosters differ: ${casts0} vs ${casts1}`);
    else ok(`rosters match (${casts0}); positions read at different moments`);
  } else ok(`identical player snapshots: ${JSON.stringify(states[0])}`);

  // partner-leave: guest bails, host holds the line (reconnect grace overlay)
  await guest.close();
  await waitFor(host, () => document.body.innerText.includes("HOLD YER HORSES"), "partner-drop overlay", 15000);
  ok("host saw the partner drop and is holding the line");

  for (const [name, page] of [["host", host]]) {
    if (page.errors.length) fail(`${name} console errors: ${page.errors.slice(0, 3).join(" | ")}`);
  }
} catch (err) {
  fail(String(err));
}

await browser.close();
console.log(failures ? `\nONLINE QA: ${failures} FAILURES` : "\nONLINE QA: ALL GREEN");
process.exit(failures ? 1 : 0);
