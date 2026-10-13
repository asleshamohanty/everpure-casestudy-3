// Should the dashboard SUGGEST an owner for orphaned reports, based on who owned them before?
// Backtest: for every report whose current owner IS known, hide it and try to predict it
// from the earlier 19 snapshots. A suggestion is only worth shipping if it beats a random guess.
const path = require("path");
const rows = require(path.join(__dirname, "..", "data", "clean", "reports_clean.json"));

const LAST = Math.max(...rows.map((r) => r.snapshot));
const known = rows.filter((r) => r.snapshot === LAST && r.owner);
const allOwners = new Set(rows.filter((r) => r.owner).map((r) => r.owner));

let mostFrequentHits = 0;
let previousHits = 0;
for (const r of known) {
  const past = rows.filter((x) => x.reportId === r.reportId && x.snapshot < LAST && x.owner);
  const counts = {};
  for (const x of past) counts[x.owner] = (counts[x.owner] || 0) + 1;
  const mostFrequent = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const previous = past.sort((a, b) => b.snapshot - a.snapshot)[0]?.owner;
  if (mostFrequent === r.owner) mostFrequentHits++;
  if (previous === r.owner) previousHits++;
}

const pct = (n) => `${((100 * n) / known.length).toFixed(0)}%`;
console.log(`Reports with a known current owner: ${known.length}`);
console.log(`Most frequent past owner correct:   ${mostFrequentHits} (${pct(mostFrequentHits)})`);
console.log(`Previous snapshot's owner correct:  ${previousHits} (${pct(previousHits)})`);
console.log(`Random guess among ${allOwners.size} owners:      ${(100 / allOwners.size).toFixed(0)}%`);
console.log(mostFrequentHits / known.length > 1 / allOwners.size
  ? "Verdict: beats chance; could ship as a suggestion."
  : "Verdict: no better than chance. Do NOT ship owner suggestions on this data.");
