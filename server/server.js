const express = require("express");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const { login, authenticate, requireRole } = require("./auth");
const { createAlertSocket } = require("./ws");
const { startReplay } = require("./alerts/replay");
const { buildFixitQueue } = require("./fixit");

const PRICE_PER_CREDIT = 3; // assumption, stated in the README
const rows = require(path.join(__dirname, "..", "data", "clean", "reports_clean.json"));
const cleaningLog = parse(fs.readFileSync(path.join(__dirname, "..", "data", "cleaning_log.csv"), "utf8"), { columns: true });
const LAST = Math.max(...rows.map((r) => r.snapshot));

// ---------- Live state ----------
// 1. Ownership registry: who is responsible for each report. Starts from the owner in the
//    latest snapshot of the CSV; admins can change it. A report with no owner is orphaned.
const owners = {};
for (const r of rows.filter((x) => x.snapshot === LAST)) owners[r.reportId] = r.owner;
const ownershipAudit = []; // every reassignment: who, what, when

// Ownership changes are saved to a small JSON file so they survive a restart.
// (Production: a database table.) `npm run reset-state` returns to the CSV's owners.
const STATE_FILE = process.env.STATE_FILE || path.join(__dirname, "..", "data", "state", "ownership.json");
try {
  const saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  for (const [id, owner] of Object.entries(saved.owners || {})) if (id in owners) owners[id] = owner;
  ownershipAudit.push(...(saved.audit || []));
  console.log(`Loaded ${ownershipAudit.length} ownership change(s) from ${path.relative(process.cwd(), STATE_FILE)}`);
} catch {
  /* no saved state yet: start from the CSV */
}
function saveState() {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const tmp = STATE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify({ owners, audit: ownershipAudit }, null, 2));
  fs.renameSync(tmp, STATE_FILE); // write-then-rename: a crash never leaves a half-written file
}

// 2. Telemetry clock: which snapshot is "now". The replay advances it every few seconds.
const live = { snapshot: 1, total: LAST, updatedAt: new Date().toISOString() };

// A row as the API shows it: telemetry from the snapshot + ownership from the registry
function present(row) {
  const owner = owners[row.reportId] ?? null;
  return { ...row, observedOwner: row.owner, owner, flags: { ...row.flags, orphan: owner === null } };
}
const currentRows = () => rows.filter((r) => r.snapshot === live.snapshot).map(present);

// Remove fields a role should not see
function shapeForRole(report, user) {
  if (user.role === "viewer") {
    const { owner, observedOwner, credits, rawCredits, awsUsd, awsPerView, ...safe } = report;
    return safe;
  }
  return report;
}

// Owners only see reports they currently own
function visibleTo(user, list) {
  if (user.role !== "owner") return list;
  return list.filter((r) => owners[r.reportId] === user.email);
}

const app = express();
app.disable("x-powered-by");                 // don't advertise the framework
app.use(express.json({ limit: "10kb" }));    // read JSON bodies; refuse oversized ones
app.use((req, res, next) => {                // basic security headers on every response
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
  });
  next();
});

// Login rate limit: at most 10 failed attempts per minute per address + username (stops password guessing)
const failedLogins = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_FAILURES = 10;
function recentFailures(key) {
  const now = Date.now();
  const list = (failedLogins.get(key) || []).filter((t) => now - t < WINDOW_MS);
  failedLogins.set(key, list);
  return list;
}

// ---------- Public route: login ----------
app.post("/api/v1/auth/login", (req, res) => {
  const key = `${req.ip}|${req.body?.username}`;
  if (recentFailures(key).length >= MAX_FAILURES) {
    return res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many failed attempts. Try again in a minute." } });
  }
  const token = login(req.body?.username, req.body?.password);
  if (!token) {
    recentFailures(key).push(Date.now());
    return res.status(401).json({ error: { code: "BAD_LOGIN", message: "Wrong username or password" } });
  }
  res.json({ token });
});

// ---------- Everything below needs a valid token ----------
app.use("/api/v1", authenticate);

app.get("/api/v1/health/summary", (req, res) => {
  const current = currentRows();
  const count = (flag) => current.filter((r) => r.flags[flag]).length;
  res.json({
    snapshot: live.snapshot,
    totalSnapshots: live.total,
    updatedAt: live.updatedAt,
    totalReports: current.length,
    refreshFailed: count("refreshFailed"),
    slowOver15s: count("slow"),
    criticalOver30s: current.filter((r) => r.loadSec > 30).length,
    orphaned: Object.values(owners).filter((o) => o === null).length,
    statusUnknown: count("statusUnknown"),
  });
});

// Admin only: reports with no owner right now
// (defined BEFORE /reports/:id so "orphans" is not mistaken for an id)
app.get("/api/v1/reports/orphans", requireRole("admin"), (req, res) => {
  const orphans = currentRows().filter((r) => r.flags.orphan);
  res.json({ count: orphans.length, reports: orphans });
});

app.get("/api/v1/reports", (req, res) => {
  let result = visibleTo(req.user, currentRows());
  if (req.query.status) result = result.filter((r) => r.status === req.query.status);
  res.json({ snapshot: live.snapshot, count: result.length, reports: result.map((r) => shapeForRole(r, req.user)) });
});

app.get("/api/v1/reports/:id", (req, res) => {
  const history = visibleTo(req.user, rows.filter((r) => r.reportId === req.params.id)).map(present);
  if (history.length === 0) {
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "No report " + req.params.id } });
  }
  res.json({ reportId: req.params.id, history: history.map((r) => shapeForRole(r, req.user)) });
});

// Admin only: assign (or remove) a report's owner. Every change is audited.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
app.patch("/api/v1/reports/:id/owner", requireRole("admin"), (req, res) => {
  const id = req.params.id;
  if (!(id in owners)) return res.status(404).json({ error: { code: "NOT_FOUND", message: "No report " + id } });
  const owner = req.body?.owner ?? null;
  if (owner !== null && !EMAIL.test(owner)) {
    return res.status(400).json({ error: { code: "INVALID_OWNER", message: "owner must be an email address or null" } });
  }
  const change = { at: new Date().toISOString(), by: req.user.username, reportId: id, from: owners[id], to: owner };
  owners[id] = owner;
  ownershipAudit.unshift(change);
  saveState();
  broadcastEvent({ type: "ownership", reportId: id, owner });
  res.json(change);
});

app.get("/api/v1/ownership/audit", requireRole("admin"), (req, res) => {
  res.json({ count: ownershipAudit.length, changes: ownershipAudit.slice(0, 50) });
});

// Costs: admin sees all, owner sees own, viewer is refused. Billing view: all snapshots.
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
    owner: owners[t.reportId] ?? null,
    costPerViewUsd: t.views > 0 ? (t.credits * PRICE_PER_CREDIT + t.awsUsd) / t.views : null,
  }));
  result.sort((a, b) => (b.costPerViewUsd ?? 0) - (a.costPerViewUsd ?? 0));
  res.json({ pricePerCreditUsd: PRICE_PER_CREDIT, count: result.length, reports: result });
});

// Fix-it queue: ranked, explainable recommendations (admin: all; owner: own reports)
app.get("/api/v1/fixit", requireRole("admin", "owner"), (req, res) => {
  const queue = buildFixitQueue(rows, owners, { pricePerCredit: PRICE_PER_CREDIT });
  if (req.user.role === "owner") {
    queue.items = queue.items.filter((it) => owners[it.reportId] === req.user.email);
    queue.summary = { ...queue.summary, reportsNeedingAction: queue.items.length,
      estimatedSavingsUsd: queue.items.reduce((s, it) => s + it.savingsUsd, 0) };
  }
  res.json(queue);
});

// Admin only: the cleaning log, so data problems are visible in the UI
app.get("/api/v1/data-quality", requireRole("admin"), (req, res) => {
  res.json({ rules: cleaningLog });
});

// ---------- Alerts ----------
const recentAlerts = []; // last 200 alerts, so a client that reconnects can catch up

app.get("/api/v1/alerts", requireRole("admin", "owner"), (req, res) => {
  const sinceNum = Number((req.query.since || "a-0").replace("a-", ""));
  const mine = recentAlerts.filter(
    (a) => Number(a.id.replace("a-", "")) > sinceNum &&
      (req.user.role === "admin" || owners[a.reportId] === req.user.email)
  );
  res.json({ count: mine.length, alerts: mine });
});

// Express handles HTTP; the WebSocket shares the same server and port
const server = http.createServer(app);
const { broadcastAlert, broadcastEvent } = createAlertSocket(server, { owners });

startReplay(rows, {
  intervalMs: Number(process.env.REPLAY_MS || 3000),
  onSnapshot: (snapshot, total) => {
    live.snapshot = snapshot;
    live.updatedAt = new Date().toISOString();
    broadcastEvent({ type: "snapshot", snapshot, total, at: live.updatedAt });
  },
  onAlert: (alert) => {
    recentAlerts.push(alert);
    if (recentAlerts.length > 200) recentAlerts.shift();
    broadcastAlert(alert);
  },
});

const PORT = Number(process.env.PORT || 4000);
server.listen(PORT, () => console.log(`API + WebSocket running at http://localhost:${PORT}`));
