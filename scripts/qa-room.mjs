// Room server QA: drives the full lobby protocol against a running server
// with plain Node WebSockets (no game involved). Default target is
// `npm run net:dev` on localhost:8787; set ROOM_URL to hit production, e.g.
//   ROOM_URL=https://banjopocalypse-net.<you>.workers.dev node scripts/qa-room.mjs
const BASE = (process.env.ROOM_URL ?? "http://localhost:8787").replace(/^http/, "ws").replace(/\/$/, "");

setTimeout(() => {
  console.error("FAIL: watchdog — QA hung");
  process.exit(1);
}, 60000).unref?.();

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error("FAIL:", msg);
};
const ok = (msg) => console.log("  ok:", msg);

/** Open a socket and collect messages; next() awaits the next one. */
function connect(path) {
  const ws = new WebSocket(`${BASE}${path}`);
  const queue = [];
  const waiters = [];
  const closed = new Promise((resolve) => {
    ws.addEventListener("close", (e) => resolve({ code: e.code, reason: e.reason }));
  });
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    const w = waiters.shift();
    if (w) w(msg);
    else queue.push(msg);
  });
  const next = (label, ms = 5000) =>
    new Promise((resolve, reject) => {
      if (queue.length) return resolve(queue.shift());
      const t = setTimeout(() => reject(new Error(`timeout waiting for ${label}`)), ms);
      waiters.push((m) => {
        clearTimeout(t);
        resolve(m);
      });
    });
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", () => reject(new Error(`connect failed: ${path}`)));
  });
  return { ws, next, opened, closed, send: (o) => ws.send(JSON.stringify(o)) };
}

try {
  // 1. host creates a room
  const host = connect("/ws/new");
  await host.opened;
  const hw = await host.next("host welcome");
  if (hw.t !== "welcome" || hw.idx !== 0 || !/^[A-Z]{4}$/.test(hw.code) || typeof hw.seed !== "number") {
    fail(`bad host welcome: ${JSON.stringify(hw)}`);
  } else ok(`room ${hw.code} created, host is slot 0, seed ${hw.seed}`);

  // 2. guest joins by code; both sides agree on the seed
  const guest = connect(`/ws/join/${hw.code}`);
  await guest.opened;
  const gw = await guest.next("guest welcome");
  if (gw.t !== "welcome" || gw.idx !== 1 || gw.seed !== hw.seed || gw.peers.join() !== "0") {
    fail(`bad guest welcome: ${JSON.stringify(gw)}`);
  } else ok("guest joined as slot 1 with the same seed");
  const joinEv = await host.next("peer join");
  if (joinEv.t !== "peer" || joinEv.event !== "join" || joinEv.idx !== 1) {
    fail(`bad join event: ${JSON.stringify(joinEv)}`);
  } else ok("host saw the join");

  // 3. inputs relay both ways, stamped with the sender
  guest.send({ t: "input", tick: 5, cmd: 3 });
  const in1 = await host.next("relayed guest input");
  if (in1.t !== "input" || in1.tick !== 5 || in1.cmd !== 3 || in1.from !== 1) {
    fail(`bad relay to host: ${JSON.stringify(in1)}`);
  } else ok("guest input relayed to host");
  host.send({ t: "input", tick: 6, cmd: 16 });
  const in2 = await guest.next("relayed host input");
  if (in2.t !== "input" || in2.tick !== 6 || in2.cmd !== 16 || in2.from !== 0) {
    fail(`bad relay to guest: ${JSON.stringify(in2)}`);
  } else ok("host input relayed to guest");

  // 4. latency probe answers the sender only
  host.send({ t: "ping", n: 42 });
  const pong = await host.next("pong");
  if (pong.t !== "pong" || pong.n !== 42) fail(`bad pong: ${JSON.stringify(pong)}`);
  else ok("ping/pong");

  // 5. a full room turns away a third player (default cap 2)
  const third = connect(`/ws/join/${hw.code}`);
  const thirdClose = await third.closed;
  if (thirdClose.code !== 4409) fail(`third join should close 4409, got ${thirdClose.code} ${thirdClose.reason}`);
  else ok("full room refused a third player");

  // 6. a bogus code is turned away
  const bogus = connect("/ws/join/QQQQ");
  const bogusClose = await bogus.closed;
  if (bogusClose.code !== 4404) fail(`bogus join should close 4404, got ${bogusClose.code} ${bogusClose.reason}`);
  else ok("unknown room refused");

  // 7. a leaver is announced
  guest.ws.close();
  const leaveEv = await host.next("peer leave");
  if (leaveEv.t !== "peer" || leaveEv.event !== "leave" || leaveEv.idx !== 1) {
    fail(`bad leave event: ${JSON.stringify(leaveEv)}`);
  } else ok("host saw the leave");

  host.ws.close();
} catch (err) {
  fail(String(err));
}

console.log(failures ? `\nROOM QA: ${failures} FAILURES` : "\nROOM QA: ALL GREEN");
process.exit(failures ? 1 : 0);
