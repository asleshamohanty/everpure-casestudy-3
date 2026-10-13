// Validates the fix-it queue before anyone acts on it:
//   1. invariants (no double counting, savings can never exceed spend, evidence on every item)
//   2. sensitivity: how much do the results move if a threshold moves by one?
// Exits non-zero if an invariant fails, so `npm test` catches it.
const path = require("path");
const rows = require(path.join(__dirname, "..", "data", "clean", "reports_clean.json"));
const { buildFixitQueue, DEFAULTS } = require("../server/fixit");

const owners = {};
for (const r of rows.filter((x) => x.snapshot === 20)) owners[r.reportId] = r.owner;

let failed = false;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
  if (!ok) failed = true;
}

const q = buildFixitQueue(rows, owners);
const s = q.summary;
console.log(`Fix-it queue: ${s.reportsNeedingAction} reports, est. savings $${Math.round(s.estimatedSavingsUsd).toLocaleString()} ` +
  `of $${Math.round(s.totalSpendUsd).toLocaleString()} total spend`);

// 1. Invariants
check("every item has a rule, evidence and an action",
  q.items.every((it) => it.findings.every((f) => f.rule && f.evidence && f.action)));
check("each report appears once", new Set(q.items.map((i) => i.reportId)).size === q.items.length);
check("no double counting: report estimate = its largest cost finding",
  q.items.every((it) => it.savingsUsd === Math.max(...it.findings.map((f) => f.savingsUsd))));
check("estimated savings never exceed total spend", s.estimatedSavingsUsd <= s.totalSpendUsd,
  `${(100 * s.estimatedSavingsUsd / s.totalSpendUsd).toFixed(1)}% of spend`);
check("reliability findings carry no invented dollar figure",
  q.items.every((it) => it.findings.every((f) => f.impact === "cost" || f.savingsUsd === 0)));
const failures = rows.reduce((m, r) => ((m[r.reportId] = (m[r.reportId] || 0) + (r.flags.refreshFailed ? 1 : 0)), m), {});
check("chronic-failure count reproducible by hand",
  s.byRule.CHRONIC_REFRESH_FAILURE === Object.values(failures).filter((n) => n >= DEFAULTS.chronicFailureMin).length);

// 2. Sensitivity: move each threshold by one step either side
console.log("\nSensitivity (reports flagged):");
for (const n of [DEFAULTS.chronicFailureMin - 1, DEFAULTS.chronicFailureMin, DEFAULTS.chronicFailureMin + 1]) {
  console.log(`  chronic failure at >= ${n} of 20:  ${buildFixitQueue(rows, owners, { chronicFailureMin: n }).summary.byRule.CHRONIC_REFRESH_FAILURE}`);
}
for (const n of [DEFAULTS.chronicSlowMin - 1, DEFAULTS.chronicSlowMin, DEFAULTS.chronicSlowMin + 1]) {
  console.log(`  chronic slow at >= ${n} of 20:     ${buildFixitQueue(rows, owners, { chronicSlowMin: n }).summary.byRule.CHRONIC_SLOW}`);
}
for (const p of [2, 3, 4]) {
  console.log(`  savings at $${p} per credit:        $${Math.round(buildFixitQueue(rows, owners, { pricePerCredit: p }).summary.estimatedSavingsUsd).toLocaleString()}`);
}

process.exit(failed ? 1 : 0);
