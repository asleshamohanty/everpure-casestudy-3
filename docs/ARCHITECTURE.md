# Architecture

```
 raw CSV ──► clean.js (8 rules, cleaning log) ──► reports_clean.json
                                                        │
                      Node.js + Express server (port 4000)
                      ├─ authenticate (401) → requireRole (403) → REST /api/v1/*
                      ├─ live state: snapshot clock (replay.js) + ownership registry
                      ├─ alert engine: warning > 15 s, critical > 30 s, on change
                      └─ ws.js /ws/alerts: alerts, snapshot + ownership events
                                                        │
 React dashboard (Vite, port 5173)                      │
   ◄── REST: data on load and on every pushed event ────┤
   ◄── WebSocket push (admin, owner) ───────────────────┘
   viewers: no socket, page refreshes every 3 s

 raw CSV ──► sql/01–05 (Snowflake SQL; tested locally in DuckDB) ──► cost per report and per view
```

## Components

| Component | Responsibility | Key decision |
|---|---|---|
| `clean.js` | Validate, clean, flag, log | Flag and keep, never silently delete; totals must reconcile |
| `server/auth.js` | Login, JWT, 401/403 middleware | Authorization on the server; the UI hiding a tab is not security |
| `server/server.js` | REST API and live state | Telemetry (status, load time, views) follows the replay clock; ownership is a separate registry that admins edit. One ownership rule everywhere |
| `server/alerts/engine.js` | Rules, severity, alert-on-change | Rules defined once; the server, tests and noise analysis share them |
| `server/fixit.js` | Fix-it queue: rules → evidence → action → savings estimate | Transparent rules, not a model; validated by `scripts/validate-fixit.js` |
| `server/alerts/replay.js` | Simulated live telemetry, the system clock | CSV has no timestamps, so snapshots are replayed on a timer |
| `server/ws.js` | WebSocket, token check, role-filtered broadcast, heartbeat | Shares port 4000 with Express |
| `client/` | React dashboard | Pages reload when a snapshot or ownership event arrives (viewers poll); old data stays on screen while refreshing; bundled fonts; Everpure palette with red kept for critical |
| `sql/` | Cost attribution in Snowflake SQL | Raw landing table, TRY_CAST, idempotent MERGE, parameters in a config table |

## Design decisions and trade-offs

| Decision | Alternative | Why |
|---|---|---|
| WebSocket | Server-sent events | Both satisfy the brief; WebSocket leaves room for two-way actions such as acknowledging an alert. SSE would be simpler for one-way push. |
| Alert on change + severity tiers | Alert on every breaching row | 82% of rows breach the brief's rule (over 15 s or failed); one alert per row would bury real problems. On change: 1,109 alerts instead of 1,636 (32% fewer), every breach of the brief's rule still notified. |
| Separate rules for latency and refresh failure | One combined "unhealthy" alert per report | Combining would hide a refresh failure that starts while a report is already slow. |
| Ownership as a registry, separate from telemetry | Owner taken from each snapshot | The data's owner field changes between snapshots; responsibility should change only by a deliberate, audited action. |
| Rules for the fix-it queue | A machine-learning model | 20 synthetic snapshots would only teach a model noise; rules can be checked by hand. A model can be added later and validated against the rules as a baseline. |
| Owner suggestions not built | Suggest the most frequent past owner | Backtest: 3% correct vs 7% for a random guess; shipping it would confidently assign reports to the wrong people. |
| Push events + reload, polling for viewers | Push full data over the socket | Keeps one source of truth (the REST API) and keeps viewers off the alert channel. |
| Token in the WebSocket URL | Cookie-based session | Browsers cannot add headers to WebSockets; over `wss://` the URL is encrypted. |
| 404 for other owners' reports | 403 | Avoids confirming that a report exists. |
| In-memory data | A database | Fits a 2,000-row case study; production would use Postgres + Snowflake (below). |
| DuckDB to test Snowflake SQL | No tests | No Snowflake account available; DuckDB runs the same MERGE/QUALIFY/window SQL. |

## Production path

| Layer | Case study | Production |
|---|---|---|
| Identity | Demo users + JWT | Corporate SSO (OIDC/SAML), roles from directory groups |
| Frontend | Vite dev server | Static build on S3 + CloudFront |
| API | One Node process | Containers on ECS/EKS behind an Application Load Balancer |
| Real-time | In-process WebSocket | WebSocket service + Redis pub/sub so any instance reaches any client |
| Telemetry | CSV replay | Portal emits events to SQS/Kinesis; alert worker consumes them |
| Alert delivery | Dashboard only | Also Slack / email / PagerDuty for critical alerts |
| Cost data | Simulated ACCOUNT_USAGE | Real `SNOWFLAKE.ACCOUNT_USAGE` + `QUERY_TAG` = report id on every portal query |
| CI/CD | GitHub Actions: tests + build | Plus staging deploy, end-to-end tests, canary release |
