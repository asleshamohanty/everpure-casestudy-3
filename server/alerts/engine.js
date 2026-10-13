// The alert rules live in ONE place, so the server, the tests and the
// noise analysis all use exactly the same definitions.
const RULES = {
  LATENCY_WARN:     { severity: "warning",      test: (r) => r.loadSec > 15 && r.loadSec <= 30, threshold: 15 },
  LATENCY_CRITICAL: { severity: "critical",     test: (r) => r.loadSec > 30,                    threshold: 30 },
  REFRESH_FAILED:   { severity: "critical",     test: (r) => r.flags.refreshFailed,             threshold: null },
  STATUS_UNKNOWN:   { severity: "data-quality", test: (r) => r.flags.statusUnknown,             threshold: null },
};

// Which rules break for one row?
function breaches(row) {
  return Object.keys(RULES).filter((name) => RULES[name].test(row));
}

// Build an alert message object
let nextId = 1;
function makeAlert(rule, row) {
  const value = rule.startsWith("LATENCY") ? row.loadSec : row.status;
  return {
    type: "alert",
    id: `a-${nextId++}`,
    rule,
    severity: RULES[rule].severity,
    reportId: row.reportId,
    reportName: row.reportName,
    owner: row.owner,
    value,
    threshold: RULES[rule].threshold,
    snapshot: row.snapshot,
    message: rule.startsWith("LATENCY")
      ? `${row.reportName} loaded in ${row.loadSec} s (${RULES[rule].severity} > ${RULES[rule].threshold} s)`
      : `${row.reportName} refresh status: ${row.status}`,
    at: new Date().toISOString(),
  };
}

// "Alert on change": remember which (report, rule) pairs were already breaching.
// Only a NEW breach produces an alert; a continuing breach stays quiet.
function createAlerter({ pushRules = ["LATENCY_CRITICAL", "REFRESH_FAILED", "STATUS_UNKNOWN"] } = {}) {
  const active = new Set(); // e.g. "RPT_203|REFRESH_FAILED"
  return function process(row) {
    const now = breaches(row).filter((r) => pushRules.includes(r));
    const alerts = [];
    for (const rule of pushRules) {
      const key = `${row.reportId}|${rule}`;
      if (now.includes(rule) && !active.has(key)) {
        active.add(key);
        alerts.push(makeAlert(rule, row));       // breach just started -> alert
      } else if (!now.includes(rule)) {
        active.delete(key);                      // recovered -> can alert again later
      }
    }
    return alerts;
  };
}

module.exports = { RULES, breaches, createAlerter, makeAlert };