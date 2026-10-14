# Pure Insights Command Center

Admin dashboard, real-time alerting and Snowflake cost attribution for Everpure's custom analytics portal.
Everpure FY27 Internship Assessment, **Case Study 3: Technical Data AI Validation – Monetization**.

## The problem

Everpure moved its internal reports from Tableau Server to a custom portal (React, Node.js, Snowflake, AWS) and lost Tableau's built-in admin views. Nobody could see which reports fail to refresh, which are slow, who owns them, or what they cost. This project rebuilds that visibility as a live monitor, adds per-report cost attribution, lets admins fix ownership, and validates that its own signals can be trusted.

**What you see when it runs:** health tiles and the report table update every few seconds as telemetry arrives; alerts are pushed the moment a report crosses 15 s or a refresh fails; clicking a report shows its 20-snapshot history; a **fix-it queue** ranks what to fix first, why, and what it is worth; an admin can assign an owner to an orphaned report and the orphan count, the queue and its savings update immediately.

## Quick start

Needs Node.js 20+, Python 3 and `pip3 install duckdb` (for the SQL tests).

```bash
npm run setup          # install server + dashboard packages
npm start              # API + WebSocket on http://localhost:4000
npm run dev:client     # dashboard on http://localhost:5173   (second terminal)
npm test               # every check: cleaning, fix-it, API/RBAC/security, alerts, SQL
npm run reset-state    # forget ownership changes made in the dashboard
```

| Demo login | Password | Sees |
|---|---|---|
| `admin` | `admin123` | Everything: live health, alerts, fix-it queue, orphans (and assigning owners), costs, data quality |
| `owner` | `owner123` | Their 9 reports (user_9@company.com): alerts, fix-it items and costs |
| `viewer` | `viewer123` | Health overview only; no owner emails, no costs, no alerts |

## How the deliverables map to the brief

| Brief | Where |
|---|---|
| Task 1: React + Node/Express dashboard with RBAC, system health, orphaned reports | `client/`, `server/server.js`, `server/auth.js` |
| Task 2: WebSocket alerts when load latency > 15 s or refreshes fail | `server/alerts/`, `server/ws.js`, `client/src/useLive.js` |
| Task 3: SQL against simulated Snowflake ACCOUNT_USAGE; credits per report; cost per active view | `sql/01–05`, run with `scripts/run_sql.py` |
| Deliverable 2: REST API & WebSocket specification | [`docs/API_SPEC.md`](docs/API_SPEC.md) |
| Data defects: identify, clean, document | `clean.js` → `data/cleaning_log.csv`, [`docs/DATA_QUALITY.md`](docs/DATA_QUALITY.md) |
| Architecture and design decisions | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |

## Key findings

- **39 of 100 reports need action, with about $318K (7.8% of spend) in estimated savings.** 14 refreshes keep failing, 22 reports are chronically slow, 7 are orphaned and costly, 4 keep refreshing with no viewers. Each recommendation names its rule and evidence; savings are estimates at $3/credit ($194K at $2, $412K at $4).

- **14 of 100 reports are orphaned** (no owner in the latest snapshot) and account for **14.4% of all spend** (about $587K at an assumed $3 per Snowflake credit).
- **The brief's 15-second rule is breached by 82% of rows** (1,636 of 2,000). Sending one alert per breaching row would bury real problems. The engine notifies every breach of the brief's rule but only when it **starts** (warning over 15 s, escalating to critical over 30 s): 1,109 alerts, **32% fewer**, with nothing missed.
- **Most expensive report per view: RPT_223 at $4.99.** The Node API and the SQL suite compute this independently and agree.
- **4 snapshots had zero views but still cost money** (e.g. RPT_230: ~$2,575 of Snowflake compute). The SQL and the Node cleaning independently flag the same 103 cost-without-usage rows.
- **Missing owners hid as the text `nan`** in 128 rows. A naive check found 117 orphan rows instead of 245.
- **A feature that did not ship:** suggesting owners for orphaned reports from their history was backtested on the 86 reports with a known owner. It was right 3% of the time, worse than a random guess (7%), so it was not built. See `scripts/backtest-owner.js`.

## Assumptions (stated, not hidden)

| Assumption | Why | Where to change it |
|---|---|---|
| Roles: admin (platform team), owner (report author), viewer (report consumer), with least-privilege permissions (see `docs/API_SPEC.md`) | The brief requires RBAC but does not define roles or permissions; these mirror who uses an internal reporting portal | `server/auth.js`, `server/server.js` |
| Every 100 CSV rows are one snapshot in time (20 snapshots) | The CSV has no timestamp; rows repeat RPT_200–299 twenty times in order | `clean.js`, `sql/02_load.sql` |
| Ownership registry starts from the owner in the latest snapshot; admins can change it | Owners change between snapshots (RPT_203 has 10); ownership is a governance record, not telemetry | `server/server.js`, `sql/04_cost_attribution.sql` |
| $3.00 per Snowflake credit | Real price depends on Everpure's contract | `server/server.js`, `REPORTING.COST_CONFIG` |
| 10% warehouse idle time in the simulated metering log | Only used to demonstrate idle-time allocation | `REPORTING.COST_CONFIG` |
| Snapshots are replayed every 3 s as live telemetry (the health view follows the replay) | No live telemetry exists; replay simulates it | `REPLAY_MS` env variable |
| Ownership changes are saved to `data/state/ownership.json` | Survives restarts without needing a database; production would use a database table | `server/server.js`, `npm run reset-state` |

The dataset file name differs from the brief (`Case_Study_3_Pure_Insights_Monitoring.csv` in the brief; `Case_Study_3_Technical_Data_AI_Validation_Intern_-_Monetization.csv` received). The received file is used, saved as `data/raw/reports.csv`.

## Security and known limitations

| Area | What the project does | Production version |
|---|---|---|
| Passwords | Demo users stored as salted scrypt hashes; constant-time comparison | Corporate single sign-on (OIDC/SAML) |
| Signing secret | Read from `JWT_SECRET`; the server **refuses to start** in production without it | Secrets manager |
| Password guessing | 10 failed logins per minute per address and username, then `429` | Plus account lockout and alerting |
| Sessions | 8-hour token, kept in `sessionStorage` (survives a refresh, cleared when the tab closes); expired or invalid sessions return to the login page | httpOnly secure cookie via SSO |
| HTTP hardening | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Cache-Control: no-store`; framework header hidden; 10 KB body limit | Plus TLS and a Content-Security-Policy at the load balancer |
| Ownership changes | Persisted to a JSON file (write-then-rename) with an audit trail; tests use a separate file | Database with a permanent audit log |
| Data | A fixed CSV replayed as a live feed, so values repeat every 60 s. Kept deliberately: inventing extra data would hide what the real data shows | Real event stream from the portal |
| Fix-it actions | Standard playbooks per problem type; root causes need refresh error logs the data does not include | Link each finding to its error logs |
| SQL tests | Need `pip3 install duckdb`; skipped with a message locally if missing, required in CI | Run against a real Snowflake account |

## Project structure

```
clean.js                 validation + cleaning → data/clean/reports_clean.json, data/cleaning_log.csv
server/
  server.js              Express REST API, live state (snapshot clock + ownership registry), WebSocket on the same port
  auth.js                JWT login, authenticate (401), requireRole (403)
  ws.js                  WebSocket server: token check, role-filtered broadcast, heartbeat
  alerts/engine.js       alert rules, severity, alert-on-change
  alerts/replay.js       replays the 20 snapshots as live telemetry
  fixit.js               fix-it queue: rules, evidence, actions, savings estimates
client/                  React (Vite) dashboard, Everpure palette; src/useLive.js = WebSocket + auto-refresh
sql/                     Snowflake SQL suite (01_ddl → 05_checks)
scripts/
  test-all.js            `npm test`: runs everything
  run_sql.py             runs the SQL suite locally in DuckDB
  alert-noise.js         measures alert volume per policy
  validate-fixit.js      fix-it queue invariants + threshold sensitivity
  backtest-owner.js      owner-suggestion backtest (negative result)
  reset-state.js         `npm run reset-state`: clear saved ownership changes
test-rbac.js, test-alerts.js   automated API and WebSocket tests
validate.js, first.js, load.js, watch-alert.js   learning scripts from the first build steps
docs/                    API spec, architecture, data quality
```

## Testing

`npm test` runs 5 suites, 61 checks plus the cleaning reconciliation; all must pass:

| Suite | Checks | What it proves |
|---|---|---|
| Cleaning | totals reconcile | raw credits − quarantined = clean credits, exactly |
| Fix-it queue | 6 | every item has evidence, no double counting, savings never exceed spend, no invented dollar figures, counts reproducible by hand (plus a sensitivity printout) |
| API + RBAC + security | 31 | security headers, forged tokens rejected, login rate limit (429), 401 without a token, 403 for the wrong role, viewers never receive emails or costs, owners see only their reports, only admins reassign owners (validated, audited, reflected in health), fix-it queue scoped by role |
| Real-time alerts | 14 | the system is live (snapshot events arrive, health view moves), viewers and fake tokens refused, owners get only their alerts, every >15 s breach notified, >30 s critical, no repeat alerts during an ongoing breach, catch-up after reconnect |
| SQL | 10 | all rows loaded, no duplicates after a re-run, quarantine reconciles, allocated = metered credits, SQL matches the API and the cleaning script |

## What I would do next

- Real telemetry: portal emits load-time and refresh events to a queue instead of replaying a CSV.
- Single sign-on (OIDC/SAML) instead of demo logins; ownership and audit log stored in a database.
- Query tags on every portal query so Snowflake attributes cost to reports exactly.
- Route critical alerts to Slack or email so they reach people with the dashboard closed.
- An alert lifecycle (acknowledge, resolve, time to acknowledge) and an alert-quality page (alerts per day, false-alarm rate).
- Agree fix-it thresholds with the platform team: moving "chronic failure" from 8 to 7 failures in 20 flags 37 reports instead of 14.
- Once real history exists, anomaly detection for load times and refresh failures, validated against the current rules as a baseline.

## How this was built

I used an AI assistant as a tutor and pair programmer. I ran, tested and reviewed every part, and can explain each design decision and its trade-offs.
