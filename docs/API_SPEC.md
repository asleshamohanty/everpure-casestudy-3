# REST API & WebSocket Specification

Base URL (local): `http://localhost:4000` · All responses are JSON · Version prefix: `/api/v1`

## Authentication

1. `POST /api/v1/auth/login` with a username and password returns a signed JWT (valid 8 hours).
2. Send it on every REST call: `Authorization: Bearer <token>`.
3. The WebSocket takes it as a query parameter, because browsers cannot set headers on WebSockets: `/ws/alerts?token=<token>` (use `wss://` in production so the token is encrypted).

The token carries `username`, `role` (`admin` | `owner` | `viewer`) and, for owners, `email`. Roles are enforced on the server for every request; the UI only hides what a role cannot use.

## Errors

Every error has the same shape:

```json
{ "error": { "code": "FORBIDDEN", "message": "Role 'viewer' cannot access this" } }
```

| HTTP | `code` | When |
|---|---|---|
| 401 | `BAD_LOGIN` | Wrong username or password |
| 401 | `UNAUTHENTICATED` | Missing, invalid or expired token |
| 403 | `FORBIDDEN` | Valid token, but the role may not use this endpoint |
| 400 | `INVALID_OWNER` | Owner is not an email address or null |
| 404 | `NOT_FOUND` | Report does not exist, or an owner asks for a report they do not own (404, not 403, so its existence is not revealed) |

## Permissions

| Endpoint | admin | owner | viewer |
|---|---|---|---|
| `GET /health/summary` | yes | yes | yes |
| `GET /reports`, `GET /reports/:id` | all | own reports only | all, without owner and cost fields |
| `GET /reports/orphans` | yes | 403 | 403 |
| `PATCH /reports/:id/owner` | yes | 403 | 403 |
| `GET /ownership/audit` | yes | 403 | 403 |
| `GET /costs` | all | own reports only | 403 |
| `GET /alerts` | all | own reports only | 403 |
| `GET /fixit` | all | own reports only | 403 |
| `GET /data-quality` | yes | 403 | 403 |
| WebSocket `/ws/alerts` | all alerts + live events | own reports' alerts + live events | closed with 4403 (the dashboard polls every 3 s instead) |

"Own reports" = reports whose owner in the **ownership registry** is the user's email. The registry starts from the owner in the latest CSV snapshot and changes when an admin reassigns a report.

## REST endpoints

### `POST /api/v1/auth/login`

Request:
```json
{ "username": "admin", "password": "admin123" }
```
Response `200`:
```json
{ "token": "eyJhbGciOiJIUzI1NiIs..." }
```

### `GET /api/v1/health/summary`

Counts for the **current** telemetry snapshot (it advances every few seconds). `orphaned` comes from the ownership registry.
```json
{
  "snapshot": 3, "totalSnapshots": 20, "updatedAt": "2026-10-13T16:14:02.400Z",
  "totalReports": 100, "refreshFailed": 22, "slowOver15s": 75, "criticalOver30s": 46,
  "orphaned": 14, "statusUnknown": 9
}
```

### `GET /api/v1/reports?status=FAILED`

Reports in the current snapshot. Optional `status`: `SUCCESS`, `FAILED`, `TIMED_OUT`, `UNKNOWN`. The response also carries `"snapshot"`.
```json
{
  "count": 16,
  "reports": [
    {
      "reportId": "RPT_207", "reportName": "Analytics Dashboard 8", "snapshot": 20,
      "owner": "user_9@company.com", "status": "FAILED", "views": 1011,
      "credits": 1029.31, "awsUsd": 27.34, "loadSec": 49.1, "peakUsers": 29, "queries": 22137,
      "flags": { "orphan": false, "negativeCredits": false, "slow": true, "refreshFailed": true,
                 "statusUnknown": false, "zeroViews": false, "peakAboveViews": false, "costOutlier": false },
      "rawCredits": 1029.31, "awsPerView": 0.027, "observedOwner": "user_9@company.com"
    }
  ]
}
```
`owner` comes from the ownership registry; `observedOwner` is the raw value in that snapshot of the data. Viewers receive the same objects without `owner`, `observedOwner`, `credits`, `rawCredits`, `awsUsd` and `awsPerView`. `credits` is `null` when the source value was negative (quarantined); `rawCredits` keeps the original.

### `GET /api/v1/reports/:id`

All 20 snapshots of one report: `{ "reportId": "RPT_203", "history": [ <report object>, ... ] }`. `404` if not found or not visible to the caller.

### `GET /api/v1/reports/orphans` (admin)

`{ "count": 14, "reports": [ <report object>, ... ] }`. A report is orphaned when the registry has no owner for it (initially: blank, the text `nan`, or `ORPHANED_REPORT` in the latest snapshot).

### `PATCH /api/v1/reports/:id/owner` (admin)

Assign an owner, or remove one with `null`. Every change is audited and pushed to connected dashboards as an `ownership` event.

Request: `{ "owner": "user_9@company.com" }`

Response `200`:
```json
{ "at": "2026-10-13T16:14:03.920Z", "by": "admin", "reportId": "RPT_201", "from": null, "to": "user_9@company.com" }
```
`400 INVALID_OWNER` if `owner` is not an email or null; `404` if the report does not exist.

### `GET /api/v1/ownership/audit` (admin)

The 50 most recent ownership changes, newest first: `{ "count": n, "changes": [ <change>, ... ] }`.

### `GET /api/v1/costs` (admin, owner)

Totals over all 20 snapshots, sorted by cost per view, highest first.
```json
{
  "pricePerCreditUsd": 3,
  "count": 100,
  "reports": [
    { "reportId": "RPT_223", "credits": 17034.76, "awsUsd": 5116.68, "views": 11259, "costPerViewUsd": 4.9934 }
  ]
}
```
`costPerViewUsd = (credits × pricePerCreditUsd + awsUsd) ÷ views`; `null` when views = 0. Negative credits are excluded.

### `GET /api/v1/fixit` (admin, owner)

Ranked recommendations from all 20 snapshots. Every finding names its rule, the evidence and the action. Only cost rules carry a dollar estimate; a report's estimate is its largest cost finding (no double counting).
```json
{
  "assumptions": { "chronicFailureMin": 8, "chronicSlowMin": 17, "pricePerCredit": 3, "medianCostPerView": 2.7134 },
  "summary": { "reportsNeedingAction": 39, "estimatedSavingsUsd": 317568.29, "totalSpendUsd": 4081006.69,
               "byRule": { "CHRONIC_REFRESH_FAILURE": 14, "CHRONIC_SLOW": 22, "ORPHANED_AND_COSTLY": 7, "REFRESHING_WITHOUT_USERS": 4 } },
  "items": [
    { "priority": 1, "reportId": "RPT_220", "owner": null, "savingsUsd": 45037.02,
      "findings": [
        { "rule": "CHRONIC_REFRESH_FAILURE", "impact": "reliability", "savingsUsd": 0,
          "evidence": "refresh failed in 9 of 20 snapshots (rule: at least 8)",
          "action": "Investigate the refresh job (schema change, credentials, timeout); retry with backoff; notify the owner" },
        { "rule": "ORPHANED_AND_COSTLY", "impact": "cost", "savingsUsd": 45037.02,
          "evidence": "no owner; $3.12 per view vs median $2.71",
          "action": "Assign an owner, or retire the report (estimate = its full spend)" }
      ] }
  ]
}
```
Owners receive only their reports, with the summary recomputed for them. Assigning an owner removes the report's `ORPHANED_AND_COSTLY` finding immediately.

### `GET /api/v1/alerts?since=a-345` (admin, owner)

Alerts after the given id, from a buffer of the last 200. Used by the dashboard to catch up after a reconnect. Returns `{ "count": n, "alerts": [ <alert>, ... ] }`.

### `GET /api/v1/data-quality` (admin)

The cleaning log: `{ "rules": [ { "rule": "orphan", "source": "brief #1", "rows_affected": "245", "action": "...", "reason": "..." }, ... ] }`.

## WebSocket: `/ws/alerts`

Connect: `ws://localhost:4000/ws/alerts?token=<token>`

### Server → client messages

On connect:
```json
{ "type": "hello", "role": "admin" }
```

Each time a telemetry snapshot arrives (every few seconds); the dashboard reloads its data:
```json
{ "type": "snapshot", "snapshot": 7, "total": 20, "at": "2026-10-13T16:14:07.400Z" }
```

When an admin reassigns a report:
```json
{ "type": "ownership", "reportId": "RPT_201", "owner": "user_9@company.com" }
```

Each alert:
```json
{
  "type": "alert",
  "id": "a-193",
  "rule": "LATENCY_CRITICAL",
  "severity": "critical",
  "reportId": "RPT_204",
  "reportName": "Analytics Dashboard 5",
  "value": 53.4,
  "threshold": 30,
  "snapshot": 1,
  "message": "Analytics Dashboard 5 loaded in 53.4 s (critical: over 30 s)",
  "at": "2026-10-13T07:15:02.114Z"
}
```

### Alert rules

| Rule | Fires when | Severity |
|---|---|---|
| `LATENCY_WARN` | load crosses 15 s (the brief's threshold) | warning |
| `LATENCY_CRITICAL` | load crosses 30 s (escalation; a jump straight past 30 s sends only this) | critical |
| `REFRESH_FAILED` | status becomes `FAILED` or `TIMED_OUT` | critical |
| `STATUS_UNKNOWN` | status becomes `UNKNOWN` | data-quality |

All four are pushed. **Alert on change:** a report + rule pair alerts when a breach **starts**, stays quiet while it continues, and can alert again after it recovers.

### Close codes

| Code | Meaning |
|---|---|
| 4401 | Missing or invalid token (like HTTP 401) |
| 4403 | Role not allowed to receive alerts, i.e. viewer (like HTTP 403) |

### Reliability

- The server pings every client every 30 s, so dead connections are detected.
- The dashboard reconnects with exponential backoff (1 s, 2 s, 4 s … up to 15 s), then calls `GET /alerts?since=<last id>` to fetch anything it missed.
- Alert state resets on logout, so one user never sees another user's alerts.
