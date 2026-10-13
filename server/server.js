const express = require("express");
const http = require("http");
const path = require("path");
const { login, authenticate, requireRole } = require("./auth");
const { createAlertSocket } = require("./ws");
const { startReplay } = require("./alerts/replay");

const rows = require(path.join(__dirname, "..", "data", "clean", "reports_clean.json"));
const LATEST = Math.max(...rows.map((r) => r.snapshot));
const latestRows = rows.filter((r) => r.snapshot === LATEST);
const PRICE_PER_CREDIT = 3; // assumption

const app = express();
app.use(express.json()); // lets us read JSON sent in a request body

// Remove fields a role should not see
function shapeForRole(report, user) {
  if (user.role === "viewer") {
    const { owner, credits, rawCredits, awsUsd, awsPerView, ...safe } = report;
    return safe;
  }
  return report;
}

// Current owner of each report = owner in the LATEST snapshot (our documented rule)
const currentOwner = {};
for (const r of latestRows) currentOwner[r.reportId] = r.owner;

// Owners only see reports they CURRENTLY own (all snapshots of those reports)
function visibleTo(user, list) {
  if (user.role !== "owner") return list;
  return list.filter((r) => currentOwner[r.reportId] === user.email);
}

// ---------- Public route: login ----------
app.post("/api/v1/auth/login", (req, res) => {
  const token = login(req.body.username, req.body.password);
  if (!token) return res.status(401).json({ error: { code: "BAD_LOGIN", message: "Wrong username or password" } });
  res.json({ token });
});

// ---------- Everything below needs a valid token ----------
app.use("/api/v1", authenticate);

app.get("/api/v1/health/summary", (req, res) => {
  const count = (flag) => latestRows.filter((r) => r.flags[flag]).length;
  res.json({
    snapshot: LATEST,
    totalReports: latestRows.length,
    refreshFailed: count("refreshFailed"),
    slowOver15s: count("slow"),
    orphaned: count("orphan"),
    statusUnknown: count("statusUnknown"),
  });
});

// Admin only: reports with no owner in the latest snapshot
// (defined BEFORE /reports/:id so "orphans" is not mistaken for an id)
app.get("/api/v1/reports/orphans", requireRole("admin"), (req, res) => {
  const orphans = latestRows.filter((r) => r.flags.orphan);
  res.json({ count: orphans.length, reports: orphans });
});

app.get("/api/v1/reports", (req, res) => {
  let result = visibleTo(req.user, latestRows);
  if (req.query.status) result = result.filter((r) => r.status === req.query.status);
  res.json({ count: result.length, reports: result.map((r) => shapeForRole(r, req.user)) });
});

app.get("/api/v1/reports/:id", (req, res) => {
  const history = visibleTo(req.user, rows.filter((r) => r.reportId === req.params.id));
  if (history.length === 0) {
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "No report " + req.params.id } });
  }
  res.json({ reportId: req.params.id, history: history.map((r) => shapeForRole(r, req.user)) });
});

// Costs: admin sees all, owner sees own, viewer is refused
app.get("/api/v1/costs", requireRole("admin", "owner"), (req, res) => {
  const byReport = {};
  for (const r of visibleTo(req.user, rows)) {
    const t = (byReport[r.reportId] ||= { reportId: r.reportId, credits: 0, awsUsd: 0, views: 0 });
    t.credits += r.credits ?? 0; // quarantined negatives count as 0
    t.awsUsd += r.awsUsd;
    t.views += r.views;
  }
  const result = Object.values(byReport).map((t) => ({
    ...t,
    costPerViewUsd: t.views > 0 ? (t.credits * PRICE_PER_CREDIT + t.awsUsd) / t.views : null,
  }));
  result.sort((a, b) => (b.costPerViewUsd ?? 0) - (a.costPerViewUsd ?? 0));
  res.json({ pricePerCreditUsd: PRICE_PER_CREDIT, count: result.length, reports: result });
});

// Admin only: the cleaning log, so data problems are visible in the UI
const fs = require("fs");
const { parse } = require("csv-parse/sync");
const cleaningLog = parse(fs.readFileSync(path.join(__dirname, "..", "data", "cleaning_log.csv"), "utf8"), { columns: true });

app.get("/api/v1/data-quality", requireRole("admin"), (req, res) => {
  res.json({ rules: cleaningLog });
});

// ---------- Alerts ----------
const recentAlerts = []; // last 200 alerts, so a client that reconnects can catch up

app.get("/api/v1/alerts", requireRole("admin", "owner"), (req, res) => {
  const sinceNum = Number((req.query.since || "a-0").replace("a-", ""));
  const mine = recentAlerts.filter(
    (a) => Number(a.id.replace("a-", "")) > sinceNum &&
      (req.user.role === "admin" || currentOwner[a.reportId] === req.user.email)
  );
  res.json({ count: mine.length, alerts: mine });
});

// Express handles HTTP; the WebSocket shares the same server and port
const server = http.createServer(app);
const { broadcast } = createAlertSocket(server, { currentOwner });

startReplay(rows, (alert) => {
  recentAlerts.push(alert);
  if (recentAlerts.length > 200) recentAlerts.shift();
  broadcast(alert);
}, { intervalMs: Number(process.env.REPLAY_MS || 3000) });

const PORT = 4000;
server.listen(PORT, () => console.log(`API + WebSocket running at http://localhost:${PORT}`));