# Pure Insights Command Center

Admin dashboard, real-time alerting and Snowflake cost attribution for Everpure's custom analytics portal.
Everpure FY27 Internship Assessment, **Case Study 3: Technical Data AI Validation – Monetization**.

## The problem

Everpure moved its internal reports from Tableau Server to a custom portal (React, Node.js, Snowflake, AWS) and lost Tableau's built-in admin views. Nobody could see which reports fail to refresh, which are slow, who owns them, or what they cost. This project rebuilds that visibility as a live monitor, adds per-report cost attribution, lets admins fix ownership, and validates that its own signals can be trusted.

**What you see when it runs:** health tiles and the report table update every few seconds as telemetry arrives; alerts are pushed the moment a report crosses 15 s or a refresh fails; clicking a report shows its 20-snapshot history; an admin can assign an owner to an orphaned report and the orphan count drops immediately.

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
| `admin` | `admin123` | Everything: live health, alerts, orphans (and assigning owners), costs, data quality |
| `owner` | `owner123` | Their 9 reports (user_9@company.com), their alerts and costs |
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

- **14 of 100 reports are orphaned** (no owner in the latest snapshot) and account for **14.4% of all spend** (about $587K at an assumed $3 per Snowflake credit).
- **The brief's 15-second rule is breached by 82% of rows** (1,636 of 2,000). Sending one alert per breaching row would bury real problems. The engine notifies every breach of the brief's rule but only when it **starts** (warning over 15 s, escalating to critical over 30 s): 1,109 alerts, **32% fewer**, with nothing missed.
- **Most expensive report per view: RPT_223 at $4.99.** The Node API and the SQL suite compute this independently and agree.
- **4 snapshots had zero views but still cost money** (e.g. RPT_230: ~$2,575 of Snowflake compute). The SQL and the Node cleaning independently flag the same 103 cost-without-usage rows.
- **Missing owners hid as the text `nan`** in 128 rows. A naive check found 117 orphan rows instead of 245.

## Assumptions (stated, not hidden)

| Assumption | Why | Where to change it |
|---|---|---|
| Every 100 CSV rows are one snapshot in time (20 snapshots) | The CSV has no timestamp; rows repeat RPT_200–299 twenty times in order | `clean.js`, `sql/02_load.sql` |
| Ownership registry starts from the owner in the latest snapshot; admins can change it | Owners change between snapshots (RPT_203 has 10); ownership is a governance record, not telemetry | `server/server.js`, `sql/04_cost_attribution.sql` |
| $3.00 per Snowflake credit | Real price depends on Everpure's contract | `server/server.js`, `REPORTING.COST_CONFIG` |
| 10% warehouse idle time in the simulated metering log | Only used to demonstrate idle-time allocation | `REPORTING.COST_CONFIG` |
| Snapshots are replayed every 3 s as live telemetry (the health view follows the replay) | No live telemetry exists; replay simulates it | `REPLAY_MS` env variable |
| Ownership changes are kept in memory | Enough for the case study; production would store them in a database | `server/server.js` |

The dataset file name differs from the brief (`Case_Study_3_Pure_Insights_Monitoring.csv` in the brief; `Case_Study_3_Technical_Data_AI_Validation_Intern_-_Monetization.csv` received). The received file is used, saved as `data/raw/reports.csv`.

## Project structure

```
clean.js                 validation + cleaning → data/clean/reports_clean.json, data/cleaning_log.csv
server/
  server.js              Express REST API, live state (snapshot clock + ownership registry), WebSocket on the same port
  auth.js                JWT login, authenticate (401), requireRole (403)
  ws.js                  WebSocket server: token check, role-filtered broadcast, heartbeat
  alerts/engine.js       alert rules, severity, alert-on-change
  alerts/replay.js       replays the 20 snapshots as live telemetry
client/                  React (Vite) dashboard, Everpure palette; src/useLive.js = WebSocket + auto-refresh
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

`npm test` runs 4 suites, 47 checks plus the cleaning reconciliation; all must pass:

| Suite | Checks | What it proves |
|---|---|---|
| Cleaning | totals reconcile | raw credits − quarantined = clean credits, exactly |
| API + RBAC | 23 | 401 without a token, 403 for the wrong role, viewers never receive emails or costs, owners see only their reports, only admins reassign owners (validated, audited, reflected in health) |
| Real-time alerts | 14 | the system is live (snapshot events arrive, health view moves), viewers and fake tokens refused, owners get only their alerts, every >15 s breach notified, >30 s critical, no repeat alerts during an ongoing breach, catch-up after reconnect |
| SQL | 10 | all rows loaded, no duplicates after a re-run, quarantine reconciles, allocated = metered credits, SQL matches the API and the cleaning script |

## What I would do next

- Real telemetry: portal emits load-time and refresh events to a queue instead of replaying a CSV.
- Single sign-on (OIDC/SAML) instead of demo logins; ownership and audit log stored in a database.
- Query tags on every portal query so Snowflake attributes cost to reports exactly.
- Route critical alerts to Slack or email so they reach people with the dashboard closed.
- An alert-quality page: alerts per day, time to acknowledge, false-alarm rate.

## How this was built

I used an AI assistant as a tutor and pair programmer. I ran, tested and reviewed every part, and can explain each design decision and its trade-offs.
