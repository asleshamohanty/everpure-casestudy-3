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
    let closeCode = null;
    socket.on("message", (data) => {
      const msg = JSON.parse(data);
      if (msg.type === "alert") alerts.push(msg);
    });
    socket.on("close", (code) => (closeCode = code));
    setTimeout(() => {
      socket.close();
      resolve({ alerts, closeCode });
    }, ms);
  });
}

(async () => {
  const admin = await login("admin", "admin123");
  const owner = await login("owner", "owner123");
  const viewer = await login("viewer", "viewer123");

  // The owner's reports, from the REST API, to compare against the stream
  const ownerReports = (await (await fetch(`${BASE}/reports`, { headers: { Authorization: `Bearer ${owner}` } })).json())
    .reports.map((r) => r.reportId);

  console.log("Listening to the live stream for 10 seconds...");
  const [a, o, v, fake] = await Promise.all([
    listen(admin, 10000),
    listen(owner, 10000),
    listen(viewer, 2000),
    listen("not-a-real-token", 2000),
  ]);

  // 1. Access control on the socket
  check("viewer socket refused with 4403", v.closeCode === 4403, `got ${v.closeCode}`);
  check("fake token refused with 4401", fake.closeCode === 4401, `got ${fake.closeCode}`);

  // 2. Alerts actually arrive
  check("admin receives alerts", a.alerts.length > 0, `${a.alerts.length} alerts`);

  // 3. Owner only sees their own reports
  const foreign = o.alerts.filter((x) => !ownerReports.includes(x.reportId));
  check("owner gets only own reports", foreign.length === 0, `${o.alerts.length} alerts, ${foreign.length} foreign`);
  check("admin sees more than owner", a.alerts.length > o.alerts.length, `${a.alerts.length} vs ${o.alerts.length}`);

  // 4. Every alert has the fields the frontend needs
  const fields = ["id", "rule", "severity", "reportId", "message", "snapshot"];
  const broken = a.alerts.filter((x) => fields.some((f) => x[f] === undefined));
  check("every alert has required fields", broken.length === 0, `${broken.length} incomplete`);

  // 5. Thresholds are respected
  const badLatency = a.alerts.filter((x) => x.rule === "LATENCY_CRITICAL" && !(x.value > 30));
  check("LATENCY_CRITICAL only above 30 s", badLatency.length === 0);
  const badRefresh = a.alerts.filter((x) => x.rule === "REFRESH_FAILED" && !["FAILED", "TIMED_OUT"].includes(x.value));
  check("REFRESH_FAILED only for FAILED/TIMED_OUT", badRefresh.length === 0);

  // 6. Alert on change: the same report+rule never alerts in two consecutive snapshots
  const seen = new Set(a.alerts.map((x) => `${x.reportId}|${x.rule}|${x.snapshot}`));
  const repeats = a.alerts.filter((x) => seen.has(`${x.reportId}|${x.rule}|${x.snapshot - 1}`));
  check("no repeat alert while a breach continues", repeats.length === 0, `${repeats.length} repeats`);

  // 7. Catch-up endpoint for reconnects
  const catchUp = await fetch(`${BASE}/alerts?since=a-0`, { headers: { Authorization: `Bearer ${admin}` } });
  check("admin can fetch missed alerts", catchUp.status === 200 && (await catchUp.json()).count > 0);
  const viewerCatchUp = await fetch(`${BASE}/alerts`, { headers: { Authorization: `Bearer ${viewer}` } });
  check("viewer blocked from alert history", viewerCatchUp.status === 403, `got ${viewerCatchUp.status}`);
})();