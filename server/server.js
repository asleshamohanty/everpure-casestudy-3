const express = require("express");
const path = require("path");

// Load the clean data once, when the server starts.
// __dirname = the folder this file lives in, so the path works from anywhere.
const rows = require(path.join(__dirname, "..", "data", "clean", "reports_clean.json"));

const LATEST = Math.max(...rows.map((r) => r.snapshot)); // 20
const latestRows = rows.filter((r) => r.snapshot === LATEST);

const app = express();

// GET /api/v1/health/summary -> the numbers for the top of the dashboard
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

// GET /api/v1/reports?status=FAILED -> list of reports, optionally filtered
app.get("/api/v1/reports", (req, res) => {
  let result = latestRows;
  if (req.query.status) {
    result = result.filter((r) => r.status === req.query.status);
  }
  res.json({ count: result.length, reports: result });
});

// GET /api/v1/reports/RPT_203 -> one report's full history (20 snapshots)
app.get("/api/v1/reports/:id", (req, res) => {
  const history = rows.filter((r) => r.reportId === req.params.id);
  if (history.length === 0) {
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "No report " + req.params.id } });
  }
  res.json({ reportId: req.params.id, history: history });
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}`);
});