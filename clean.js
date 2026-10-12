const fs = require("fs");
const { parse } = require("csv-parse/sync");

const PRICE_PER_CREDIT = 3; // assumption, stated in the README

// ---------- 1. Load ----------
const text = fs.readFileSync("data/raw/reports.csv", "utf8");
const rawRows = parse(text, { columns: true });

// ---------- 2. Clean each row into a new, tidy object ----------
const MISSING_OWNER = ["", "nan", "ORPHANED_REPORT"];

const rows = rawRows.map((raw, index) => {
  const views = Number(raw.monthly_active_views);
  const credits = Number(raw.snowflake_credits_consumed);
  const awsUsd = Number(raw.aws_hosting_cost_usd);
  const loadSec = Number(raw.avg_load_time_sec);
  const peakUsers = Number(raw.concurrent_user_peak);
  const status = raw.last_refresh_status;
  const ownerMissing = MISSING_OWNER.includes(raw.owner_email);

  return {
    reportId: raw.report_id,
    reportName: raw.report_name,
    snapshot: Math.floor(index / 100) + 1, // assumption: every 100 rows = 1 snapshot
    owner: ownerMissing ? null : raw.owner_email,
    status: status,
    views: views,
    credits: credits < 0 ? null : credits, // quarantine negatives
    awsUsd: awsUsd,
    loadSec: loadSec,
    peakUsers: peakUsers,
    queries: Number(raw.query_count_last_30d),
    // flags: true/false answers the dashboard and alerts will use
    flags: {
      orphan: ownerMissing,
      negativeCredits: credits < 0,
      slow: loadSec > 15,
      refreshFailed: status === "FAILED" || status === "TIMED_OUT",
      statusUnknown: status === "UNKNOWN",
      zeroViews: views === 0,
      peakAboveViews: peakUsers > views,
    },
    rawCredits: credits, // keep the original value for the audit trail
  };
});

// ---------- 3. Defect 4: AWS cost vs usage ----------
// AWS cost per view; null when views = 0 (never divide by zero)
for (const row of rows) {
  row.awsPerView = row.views > 0 ? row.awsUsd / row.views : null;
}
const sorted = rows
  .map((r) => r.awsPerView)
  .filter((v) => v !== null)
  .sort((a, b) => a - b);
const p95 = sorted[Math.floor(sorted.length * 0.95)]; // 95th percentile
for (const row of rows) {
  row.flags.costOutlier = row.awsPerView === null || row.awsPerView > p95;
}

// ---------- 4. Cleaning log: one line per rule ----------
const count = (flag) => rows.filter((r) => r.flags[flag]).length;
const log = [
  ["orphan", "brief #1", count("orphan"), "owner set to null, flagged", "blank, 'nan' text and ORPHANED_REPORT all mean no owner"],
  ["negativeCredits", "brief #2", count("negativeCredits"), "excluded from cost totals, original kept", "negative compute is not physically possible; may be a refund"],
  ["slow", "brief #3", count("slow"), "kept, drives alerts", "slow loads are the signal, not an error"],
  ["costOutlier", "brief #4", count("costOutlier"), "flagged as cost without usage", `AWS cost per view above p95 ($${p95.toFixed(2)}) or zero views`],
  ["refreshFailed", "Task 2 rule", count("refreshFailed"), "kept, drives alerts", "FAILED and TIMED_OUT both leave stale data"],
  ["statusUnknown", "found", count("statusUnknown"), "data-quality warning", "neither success nor failure; our judgment call"],
  ["zeroViews", "found", count("zeroViews"), "cost per view = null", "avoid divide-by-zero (Infinity)"],
  ["peakAboveViews", "found", count("peakAboveViews"), "flagged, low priority", "inconsistent under obvious definitions; columns undefined"],
];

const header = "rule,source,rows_affected,action,reason";
const lines = log.map((l) => l.map((v) => `"${v}"`).join(","));
fs.writeFileSync("data/cleaning_log.csv", [header, ...lines].join("\n"));

// ---------- 5. Save clean data and check totals reconcile ----------
fs.writeFileSync("data/clean/reports_clean.json", JSON.stringify(rows, null, 2));

const rawTotal = rows.reduce((sum, r) => sum + r.rawCredits, 0);
const cleanTotal = rows.reduce((sum, r) => sum + (r.credits ?? 0), 0);
const quarantined = rows.filter((r) => r.flags.negativeCredits).reduce((s, r) => s + r.rawCredits, 0);

console.table(log.map(([rule, source, n]) => ({ rule, source, rows: n })));
console.log("Credits raw:        ", rawTotal.toFixed(2));
console.log("Credits clean:      ", cleanTotal.toFixed(2));
console.log("Quarantined:        ", quarantined.toFixed(2));
console.log("Reconciles?         ", Math.abs(rawTotal - quarantined - cleanTotal) < 0.01);