// Automated checks for Task 2. Start the server first, then: node test-alerts.js
// Takes about 10 seconds because it listens to the live stream.
const WebSocket = require("ws");
const BASE = "http://localhost:4000/api/v1";
const WS = "ws://localhost:4000/ws/alerts";

function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!ok) process.exitCode = 1;
}

async function login(username, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return (await res.json()).token;
}

// Open a socket, collect everything for `ms` milliseconds, report how it closed
function listen(token, ms) {
  return new Promise((resolve) => {
    const socket = new WebSocket(`${WS}?token=${token}`);
    const alerts = [];
    const snapshots = [];
    let closeCode = null;
    socket.on("message", (data) => {
      const msg = JSON.parse(data);
      if (msg.type === "alert") alerts.push(msg);
      if (msg.type === "snapshot") snapshots.push(msg.snapshot);
    });
    socket.on("close", (code) => (closeCode = code));
    setTimeout(() => {
      socket.close();
      resolve({ alerts, snapshots, closeCode });
    }, ms);
  });
}

(async () => {
  const admin = await login("admin", "admin123");
  const owner = await login("owner", "owner123");
  const viewer = await login("viewer", "viewer123");
  const get = async (path, token) => (await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } })).json();

  const ownerReports = (await get("/reports", owner)).reports.map((r) => r.reportId);
  const healthBefore = await get("/health/summary", admin);

  console.log("Listening to the live stream for 10 seconds...");
  const [a, o, v, fake] = await Promise.all([
    listen(admin, 10000),
    listen(owner, 10000),
    listen(viewer, 2000),
    listen("not-a-real-token", 2000),
  ]);
  const healthAfter = await get("/health/summary", admin);

  // 1. Access control on the socket
  check("viewer socket refused with 4403", v.closeCode === 4403, `got ${v.closeCode}`);
  check("fake token refused with 4401", fake.closeCode === 4401, `got ${fake.closeCode}`);

  // 2. The system is live: snapshots arrive and the health view moves with them
  check("snapshot events arrive", a.snapshots.length >= 2, `${a.snapshots.length} snapshots`);
  check("health view follows the live snapshot", healthAfter.snapshot !== healthBefore.snapshot,
    `snapshot ${healthBefore.snapshot} -> ${healthAfter.snapshot}`);

  // 3. Alerts actually arrive, and only to the right people
  check("admin receives alerts", a.alerts.length > 0, `${a.alerts.length} alerts`);
  const foreign = o.alerts.filter((x) => !ownerReports.includes(x.reportId));
  check("owner gets only own reports", foreign.length === 0, `${o.alerts.length} alerts, ${foreign.length} foreign`);

  // 4. Every alert has the fields the frontend needs
  const fields = ["id", "rule", "severity", "reportId", "message", "snapshot"];
  check("every alert has required fields", a.alerts.every((x) => fields.every((f) => x[f] !== undefined)));

  // 5. Thresholds match the brief: every load over 15 s is notified; over 30 s is critical
  check("LATENCY_WARN only for 15-30 s", a.alerts.filter((x) => x.rule === "LATENCY_WARN").every((x) => x.value > 15 && x.value <= 30));
  check("LATENCY_CRITICAL only above 30 s", a.alerts.filter((x) => x.rule === "LATENCY_CRITICAL").every((x) => x.value > 30));
  check("REFRESH_FAILED only for FAILED/TIMED_OUT",
    a.alerts.filter((x) => x.rule === "REFRESH_FAILED").every((x) => ["FAILED", "TIMED_OUT"].includes(x.value)));
  check("both warning and critical latency alerts are pushed",
    a.alerts.some((x) => x.rule === "LATENCY_WARN") && a.alerts.some((x) => x.rule === "LATENCY_CRITICAL"));

  // 6. Alert on change: the same report+rule never alerts in two consecutive snapshots
  const seen = new Set(a.alerts.map((x) => `${x.reportId}|${x.rule}|${x.snapshot}`));
  const repeats = a.alerts.filter((x) => seen.has(`${x.reportId}|${x.rule}|${x.snapshot - 1}`));
  check("no repeat alert while a breach continues", repeats.length === 0, `${repeats.length} repeats`);

  // 7. Catch-up endpoint for reconnects
  check("admin can fetch missed alerts", (await get("/alerts?since=a-0", admin)).count > 0);
  const viewerCatchUp = await fetch(`${BASE}/alerts`, { headers: { Authorization: `Bearer ${viewer}` } });
  check("viewer blocked from alert history", viewerCatchUp.status === 403, `got ${viewerCatchUp.status}`);
})();
