# Architecture

```
 raw CSV ──► clean.js (8 rules, cleaning log) ──► reports_clean.json
                                                       │
                     ┌─────────────── Node.js + Express server (port 4000) ───────────────┐
                     │  authenticate (401) → requireRole (403) → REST routes /api/v1/*      │
 React dashboard ◄──►│                                                                      │
 (Vite, port 5173)   │  replay.js → alert engine (tiers, on-change) → ws.js /ws/alerts ────┼──► push
                     └──────────────────────────────────────────────────────────────────────┘

 raw CSV ──► sql/01–05 (Snowflake SQL; tested locally in DuckDB) ──► cost per report and per view
```

## Components

| Component | Responsibility | Key decision |
|---|---|---|
| `clean.js` | Validate, clean, flag, log | Flag and keep, never silently delete; totals must reconcile |
| `server/auth.js` | Login, JWT, 401/403 middleware | Authorization on the server; the UI hiding a tab is not security |
| `server/server.js` | REST API | One ownership rule everywhere: owner in the latest snapshot |
| `server/alerts/engine.js` | Rules, severity, alert-on-change | Rules defined once; the server, tests and noise analysis share them |
| `server/alerts/replay.js` | Simulated live telemetry | CSV has no timestamps, so snapshots are replayed on a timer |
| `server/ws.js` | WebSocket, token check, role-filtered broadcast, heartbeat | Shares port 4000 with Express |
| `client/` | React dashboard | Bundled fonts (no runtime third-party calls); Everpure palette with red kept for critical |
| `sql/` | Cost attribution in Snowflake SQL | Raw landing table, TRY_CAST, idempotent MERGE, parameters in a config table |

## Design decisions and trade-offs

| Decision | Alternative | Why |
|---|---|---|
| WebSocket | Server-sent events | Both satisfy the brief; WebSocket leaves room for two-way actions such as acknowledging an alert. SSE would be simpler for one-way push. |
| Alert on change + severity tiers | Alert on every breaching row | The literal rule fires on 82% of rows; alert fatigue makes a monitor useless. |
| Separate rules for latency and refresh failure | One combined "unhealthy" alert per report (69% fewer alerts) | Combining would hide a refresh failure that starts while a report is already slow. |
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
