# Data Quality

Source: `data/raw/reports.csv`, 2,000 rows × 10 columns: 100 reports (RPT_200–RPT_299), each appearing 20 times, no timestamp column.
Every rule runs in `clean.js`; results are written to `data/cleaning_log.csv` and shown on the dashboard's Data quality tab (admin).

## Rules and results

| Rule | Source | Rows | Action | Reason |
|---|---|---|---|---|
| orphan | Brief defect 1 | 245 | Owner set to null, flagged | Blank, the text `nan` (128 rows) and `ORPHANED_REPORT` (117) all mean no owner |
| negativeCredits | Brief defect 2 | 24 | Excluded from cost totals; original kept | Negative compute is impossible; may be a refund or meter error |
| slow (> 15 s) | Brief defect 3 | 1,490 | Kept; drives alerts | Slow loads are the signal, not an error |
| costOutlier | Brief defect 4 | 103 | Flagged as cost without usage | AWS cost per view above the 95th percentile, or zero views |
| refreshFailed | Task 2 rule | 564 | Kept; drives alerts | FAILED and TIMED_OUT both leave stale data |
| statusUnknown | Found | 100 | Data-quality warning | Neither success nor failure; a judgment call |
| zeroViews | Found | 4 | Cost per view = null | Prevents divide-by-zero (Infinity) |
| peakAboveViews | Found | 93 | Flagged, low priority | Inconsistent under the obvious definitions, but columns are undefined; ~96 expected if the two columns are unrelated random numbers |

**Reconciliation:** raw credits 1,206,191.44 − quarantined (−161.04) = clean credits 1,206,352.48, exactly.

**Cross-check:** `sql/04_cost_attribution.sql` implements the cost-vs-usage rule (defect 4) independently in SQL (`REPORTING.V_AWS_COST_VS_USAGE`, `PERCENTILE_DISC(0.95)`); check #10 in `05_checks.sql` confirms it flags the same 103 rows as `clean.js`.

## Other observations

| Observation | Evidence | How handled |
|---|---|---|
| Missing owners stored as the text `nan` | 128 rows; a JavaScript check for `""` misses them (117 found instead of 245) | Included in the orphan rule |
| Ownership changes between snapshots | RPT_203 has 10 different owners across 20 rows; 94 of 100 reports have at least one ownerless row | Current owner = latest snapshot → 14 orphaned reports |
| No timestamps | No date column | Every 100 rows treated as one snapshot; stated as an assumption |
| TIMED_OUT loads no slower than SUCCESS | 26.9 s vs 27.8 s average; t-test p = 0.45 | Not significant (noise); suggests status and load time were generated independently |
| Views and AWS cost unrelated | Correlation ≈ 0; AWS cost per view $0.01 to $179.58 | Basis for the cost-outlier rule |
| File name differs from the brief | See README | Received file used |

## Alert noise analysis (`node scripts/alert-noise.js`)

| Policy | Alerts over 20 snapshots |
|---|---|
| One alert per row over 15 s or failed | 1,636 (82% of rows) |
| **Chosen: alert when a breach starts, same coverage** | **1,109 (32% fewer)** |
| of which: latency warning (15–30 s) | 180 |
| of which: latency critical (> 30 s) | 510 |
| of which: refresh failed / timed out | 419 |
| Plus UNKNOWN-status data-quality alerts | +93 |

The data is synthetic and values change randomly between snapshots, so real-world noise reduction would differ.

## Validating the fix-it queue (`node scripts/validate-fixit.js`)

| Invariant | Result |
|---|---|
| Every item names a rule, evidence and an action | Pass |
| Each report appears once; its estimate = its largest cost finding (no double counting) | Pass |
| Estimated savings ≤ total spend | Pass ($317,568 = 7.8% of $4,081,007) |
| Reliability findings carry no invented dollar figure | Pass |
| Chronic-failure count reproducible by hand | Pass |

**Sensitivity:** the thresholds matter a lot, so they should be agreed with the platform team before anyone acts on the counts.

| Threshold | One step lower | Chosen | One step higher |
|---|---|---|---|
| Chronic refresh failure (failed in ≥ n of 20) | 37 reports (n = 7) | 14 (n = 8) | 8 (n = 9) |
| Chronically slow (> 15 s in ≥ n of 20) | 41 (n = 16) | 22 (n = 17) | 11 (n = 18) |
| Price per credit | $193,761 ($2) | $317,568 ($3) | $411,786 ($4) |

## A feature that did not ship: owner suggestions (`node scripts/backtest-owner.js`)

**Idea:** for each orphaned report, suggest the person who owned it most often in its history.
**Test:** for the 86 reports whose current owner is known, hide it and predict it from the previous 19 snapshots.

| Method | Correct |
|---|---|
| Most frequent past owner | 3 of 86 (3%) |
| Owner in the previous snapshot | 4 of 86 (5%) |
| Random guess among 14 owners | 7% |

**Decision:** not shipped. On this data ownership history predicts nothing, so suggestions would confidently point admins at the wrong people. Admins assign owners manually instead, and every change is audited. With real ownership history the same backtest would decide whether to revisit it.
