// Reconnect QA: two browsers play online, then the guest's socket is yanked
// mid-level. The guest must slip back into its slot, the resume protocol must
// refill both input directions, and the sims must keep lockstep — proven by
// identical exchanged hashes well after the drop, zero desyncs. Needs
// `vite --port 5200`; QA_NET overrides the relay (default: production).
import { chromium } from "playwright";

const PORT = process.env.QA_PORT ?? "5200";
const NET = process.env.QA_NET ?? "";
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
const waitFor = async (page, fn, label, ms = 30000, arg = null) => {
  await page.waitForFunction(fn, arg, { timeout: ms }).catch(() => {
    throw new Error(`timeout: ${label}`);
  });
};

try {
  const host = await mkPage();
  await host.goto(`http://localhost:${PORT}/?online=host&cast=earl${netParam}#/`, { waitUntil: "networkidle" });
  await waitFor(host, () => window.__lobby?.code, "host lobby code");
  const code = await host.evaluate(() => window.__lobby.code);

  const guest = await mkPage();
  await guest.goto(`http://localhost:${PORT}/?online=join&room=${code}&cast=buford${netParam}#/`, { waitUntil: "networkidle" });
  for (const [name, page] of [["host", host], ["guest", guest]]) {
    await waitFor(page, () => window.__banjo?.sim?.tick > 300, `${name} sim ticking`, 60000);
  }
  ok(`room ${code}: both sims past tick 300`);

  // yank the guest's socket mid-level
  const dropTick = await guest.evaluate(() => {
    window.__banjoClient.debugDropSocket();
    return window.__banjo.sim.tick;
  });
  ok(`guest socket dropped at tick ${dropTick}`);

  // the guest should reconnect + resume: both sims push well past the drop
  const target = dropTick + 600;
  for (const [name, page] of [["host", host], ["guest", guest]]) {
    await waitFor(page, (t) => window.__banjo.sim.tick > t, `${name} resumed past drop+600`, 60000, target);
  }
  ok("both sims resumed and advanced 600+ ticks past the drop");

  // lockstep proof: a common exchanged hash tick after the drop must match
  const hashTick = Math.ceil((dropTick + 300) / 60) * 60;
  const [h1, h2] = await Promise.all(
    [host, guest].map((p) => p.evaluate((t) => window.__banjoNet.hashAt(t), hashTick)),
  );
  if (h1 === undefined || h2 === undefined) fail(`hash at tick ${hashTick} missing (${h1}, ${h2})`);
  else if (h1 !== h2) fail(`DESYNC after reconnect: tick-${hashTick} hashes differ (${h1} vs ${h2})`);
  else ok(`tick-${hashTick} hashes identical after reconnect (${h1})`);

  const desyncs = await Promise.all([host, guest].map((p) => p.evaluate(() => window.__banjoNet.desyncAt)));
  if (desyncs.some((d) => d !== null)) fail(`desync flagged: ${desyncs.join(", ")}`);
  else ok("no desyncs flagged");

  const trouble = await Promise.all(
    [host, guest].map((p) => p.evaluate(() => document.body.innerText.includes("HOLD YER HORSES"))),
  );
  if (trouble.some(Boolean)) fail("trouble overlay still showing after recovery");
  else ok("trouble overlays cleared");

  for (const [name, page] of [["host", host], ["guest", guest]]) {
    if (page.errors.length) fail(`${name} console errors: ${page.errors.slice(0, 3).join(" | ")}`);
  }
} catch (err) {
  fail(String(err));
}

await browser.close();
console.log(failures ? `\nRECONNECT QA: ${failures} FAILURES` : "\nRECONNECT QA: ALL GREEN");
process.exit(failures ? 1 : 0);
