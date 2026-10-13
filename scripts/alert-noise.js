// Measures how many alerts each policy would send. This is how we VALIDATE the alerting.
const path = require("path");
const rows = require(path.join(__dirname, "..", "data", "clean", "reports_clean.json"));
const { createAlerter } = require("../server/alerts/engine");

const inOrder = [...rows].sort((a, b) => a.snapshot - b.snapshot);
const literal = rows.filter((r) => r.loadSec > 15 || r.flags.refreshFailed).length;

const alerter = createAlerter();
const sent = inOrder.flatMap((r) => alerter(r));
const count = (rule) => sent.filter((a) => a.rule === rule).length;
const brief = count("LATENCY_WARN") + count("LATENCY_CRITICAL") + count("REFRESH_FAILED");

console.log("Literal rule: one alert per row over 15 s or failed:", literal);
console.log("Our engine, alert on change (same coverage):        ", brief,
  `(${Math.round((1 - brief / literal) * 100)}% fewer)`);
console.log("   latency warning (15-30 s):   ", count("LATENCY_WARN"));
console.log("   latency critical (> 30 s):   ", count("LATENCY_CRITICAL"));
console.log("   refresh failed / timed out:  ", count("REFRESH_FAILED"));
console.log("Plus data-quality (UNKNOWN status):                 ", count("STATUS_UNKNOWN"));
