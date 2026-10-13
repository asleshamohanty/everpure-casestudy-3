# Pure Insights Command Center

Admin dashboard, real-time alerting and Snowflake cost attribution for Everpure's custom analytics portal.
Everpure FY27 Internship Assessment, **Case Study 3: Technical Data AI Validation – Monetization**.

## The problem

Everpure moved its internal reports from Tableau Server to a custom portal (React, Node.js, Snowflake, AWS) and lost Tableau's built-in admin views. Nobody could see which reports fail to refresh, which are slow, who owns them, or what they cost. This project rebuilds that visibility, adds per-report cost attribution, and validates that its own signals can be trusted.

## Quick start

Needs Node.js 20+, Python 3 and `pip3 install duckdb` (for the SQL tests).

```bash
npm run setup          # install server + dashboard packages
npm start              # API + WebSocket on http://localhost:4000
npm run dev:client     # dashboard on http://localhost:5173   (second terminal)
npm test               # every check: cleaning, API/RBAC, alerts, SQL
```

| Demo login | Password | Sees |
|---|---|---|
| `admin` | `admin123` | Everything: health, live alerts, orphans, costs, data quality |
| `owner` | `owner123` | Their 9 reports (user_9@company.com), their alerts and costs |
| `viewer` | `viewer123` | Health overview only; no owner emails, no costs, no alerts |

## How the deliverables map to the brief

| Brief | Where |
|---|---|
| Task 1: React + Node/Express dashboard with RBAC, system health, orphaned reports | `client/`, `server/server.js`, `server/auth.js` |
| Task 2: WebSocket alerts when load latency > 15 s or refreshes fail | `server/alerts/`, `server/ws.js`, `client/src/useAlerts.js` |
| Task 3: SQL against simulated Snowflake ACCOUNT_USAGE; credits per report; cost per active view | `sql/01–05`, run with `scripts/run_sql.py` |
| Deliverable 2: REST API & WebSocket specification | [`docs/API_SPEC.md`](docs/API_SPEC.md) |
| Data defects: identify, clean, document | `clean.js` → `data/cleaning_log.csv`, [`docs/DATA_QUALITY.md`](docs/DATA_QUALITY.md) |
| Architecture and design decisions | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |

## Key findings

- **14 of 100 reports are orphaned** (no owner in the latest snapshot) and account for **14.4% of all spend** (about $587K at an assumed $3 per Snowflake credit).
- **The brief's 15-second rule fires on 82% of rows** (1,636 of 2,000). Alerting on change with severity tiers cuts this to 929 alerts (**43% fewer**) without hiding any new failure.
- **Most expensive report per view: RPT_223 at $4.99.** The Node API and the SQL suite compute this independently and agree.
- **4 snapshots had zero views but still cost money** (e.g. RPT_230: ~$2,575 of Snowflake compute).
- **Missing owners hid as the text `nan`** in 128 rows. A naive check found 117 orphan rows instead of 245.

## Assumptions (stated, not hidden)

| Assumption | Why | Where to change it |
|---|---|---|
| Every 100 CSV rows are one snapshot in time (20 snapshots) | The CSV has no timestamp; rows repeat RPT_200–299 twenty times in order | `clean.js`, `sql/02_load.sql` |
| Current owner = owner in the latest snapshot | Owners change between snapshots (RPT_203 has 10) | `server/server.js`, `sql/04_cost_attribution.sql` |
| $3.00 per Snowflake credit | Real price depends on Everpure's contract | `server/server.js`, `REPORTING.COST_CONFIG` |
| 10% warehouse idle time in the simulated metering log | Only used to demonstrate idle-time allocation | `REPORTING.COST_CONFIG` |
| Alerts are replayed from snapshots every 3 s | No live telemetry exists; replay simulates it | `REPLAY_MS` env variable |

The dataset file name differs from the brief (`Case_Study_3_Pure_Insights_Monitoring.csv` in the brief; `Case_Study_3_Technical_Data_AI_Validation_Intern_-_Monetization.csv` received). The received file is used, saved as `data/raw/reports.csv`.

## Project structure

```
clean.js                 validation + cleaning → data/clean/reports_clean.json, data/cleaning_log.csv
server/
  server.js              Express REST API (+ WebSocket on the same port)
  auth.js                JWT login, authenticate (401), requireRole (403)
  ws.js                  WebSocket server: token check, role-filtered broadcast, heartbeat
  alerts/engine.js       alert rules, severity, alert-on-change
  alerts/replay.js       replays the 20 snapshots as live telemetry
client/                  React (Vite) dashboard, Everpure palette
sql/                     Snowflake SQL suite (01_ddl → 05_checks)
scripts/
  test-all.js            `npm test`: runs everything
  run_sql.py             runs the SQL suite locally in DuckDB
  alert-noise.js         measures alert volume per policy
test-rbac.js, test-alerts.js   automated API and WebSocket tests
validate.js, first.js, load.js, watch-alert.js   learning scripts from the first build steps
docs/                    API spec, architecture, data quality
```

## Testing

`npm test` runs 4 suites; all must pass:

| Suite | Checks | What it proves |
|---|---|---|
| Cleaning | totals reconcile | raw credits − quarantined = clean credits, exactly |
| API + RBAC | 12 | 401 without a token, 403 for the wrong role, owners see only their reports |
| Real-time alerts | 11 | viewers and fake tokens refused, owners get only their alerts, thresholds correct, no repeat alerts during an ongoing breach, catch-up after reconnect |
| SQL | 9 | all rows loaded, no duplicates after a re-run, quarantine reconciles, allocated = metered credits, SQL matches the API |

## What I would do next

- Real telemetry: portal emits load-time and refresh events to a queue instead of replaying a CSV.
- Single sign-on (OIDC/SAML) instead of demo logins; audit log for owner reassignment.
- Query tags on every portal query so Snowflake attributes cost to reports exactly.
- Route critical alerts to Slack or email so they reach people with the dashboard closed.
- An alert-quality page: alerts per day, time to acknowledge, false-alarm rate.

## How this was built

> Edit this section to match the assessment's rules on AI tools.

I used an AI assistant as a tutor and pair programmer. I ran, tested and reviewed every part, and can explain each design decision and its trade-offs.
