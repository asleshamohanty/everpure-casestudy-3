// The alert rules live in ONE place, so the server, the tests and the
// noise analysis all use exactly the same definitions.
//
// Brief: "notify whenever dashboard load latency exceeds 15 seconds or automated refreshes fail".
// Every breach of 15 s is pushed (warning); above 30 s it is critical.
const RULES = {
  LATENCY_WARN:     { severity: "warning",      test: (r) => r.loadSec > 15, threshold: 15 },
  LATENCY_CRITICAL: { severity: "critical",     test: (r) => r.loadSec > 30, threshold: 30 },
  REFRESH_FAILED:   { severity: "critical",     test: (r) => r.flags.refreshFailed, threshold: null },
  STATUS_UNKNOWN:   { severity: "data-quality", test: (r) => r.flags.statusUnknown, threshold: null },
};

// Which rules break for one row?
function breaches(row) {
  return Object.keys(RULES).filter((name) => RULES[name].test(row));
}

// Build an alert message object
let nextId = 1;
function makeAlert(rule, row) {
  const latency = rule.startsWith("LATENCY");
  return {
    type: "alert",
    id: `a-${nextId++}`,
    rule,
    severity: RULES[rule].severity,
    reportId: row.reportId,
    reportName: row.reportName,
    value: latency ? row.loadSec : row.status,
    threshold: RULES[rule].threshold,
    snapshot: row.snapshot,
    message: latency
      ? `${row.reportName} loaded in ${row.loadSec} s (${RULES[rule].severity}: over ${RULES[rule].threshold} s)`
      : `${row.reportName} refresh status: ${row.status}`,
    at: new Date().toISOString(),
  };
}

// "Alert on change": remember which (report, rule) pairs are already breaching.
// Only a NEW breach produces an alert; a continuing breach stays quiet.
// Latency escalates: crossing 15 s -> warning; crossing 30 s -> critical
// (a jump straight past 30 s sends only the critical alert).
function createAlerter() {
  const active = new Set(); // e.g. "RPT_203|REFRESH_FAILED"
  const isNew = (key) => !active.has(key);

  return function process(row) {
    const now = new Set(breaches(row));
    const alerts = [];
    const key = (rule) => `${row.reportId}|${rule}`;

    // Latency: critical first, so a jump past 30 s does not also send a warning
    const newCritical = now.has("LATENCY_CRITICAL") && isNew(key("LATENCY_CRITICAL"));
    const newWarn = now.has("LATENCY_WARN") && isNew(key("LATENCY_WARN"));
    if (newCritical) alerts.push(makeAlert("LATENCY_CRITICAL", row));
    else if (newWarn) alerts.push(makeAlert("LATENCY_WARN", row));

    for (const rule of ["REFRESH_FAILED", "STATUS_UNKNOWN"]) {
      if (now.has(rule) && isNew(key(rule))) alerts.push(makeAlert(rule, row));
    }

    // Update state: breaching rules become active, recovered ones are cleared
    for (const rule of Object.keys(RULES)) {
      if (now.has(rule)) active.add(key(rule));
      else active.delete(key(rule));
    }
    return alerts;
  };
}

module.exports = { RULES, breaches, createAlerter, makeAlert };
