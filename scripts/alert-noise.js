// Measures how many alerts each policy would send. This is how we VALIDATE the alerting.
const path = require("path");
const rows = require(path.join(__dirname, "..", "data", "clean", "reports_clean.json"));
const { createAlerter } = require("../server/alerts/engine");

const literal = rows.filter((r) => r.loadSec > 15 || r.flags.refreshFailed).length;
const criticalPerRow = rows.filter((r) => r.loadSec > 30 || r.flags.refreshFailed).length;

const alerter = createAlerter({ pushRules: ["LATENCY_CRITICAL", "REFRESH_FAILED"] });
let onChange = 0;
for (const r of [...rows].sort((a, b) => a.snapshot - b.snapshot)) onChange += alerter(r).length;

const all = createAlerter();
let withDQ = 0;
for (const r of [...rows].sort((a, b) => a.snapshot - b.snapshot)) withDQ += all(r).length;

console.log("Brief's literal rule, one alert per breaching row:", literal);
console.log("Critical only (>30 s or failed), per row:          ", criticalPerRow);
console.log("Critical only, alert on change:                    ", onChange,
  `(${Math.round((1 - onChange / literal) * 100)}% fewer than literal)`);
console.log("  + UNKNOWN status data-quality alerts:            ", withDQ - onChange);