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
| 404 | `NOT_FOUND` | Report does not exist, or an owner asks for a report they do not own (404, not 403, so its existence is not revealed) |

## Permissions

| Endpoint | admin | owner | viewer |
|---|---|---|---|
| `GET /health/summary` | yes | yes | yes |
| `GET /reports`, `GET /reports/:id` | all | own reports only | all, without owner and cost fields |
| `GET /reports/orphans` | yes | 403 | 403 |
| `GET /costs` | all | own reports only | 403 |
| `GET /alerts` | all | own reports only | 403 |
| `GET /data-quality` | yes | 403 | 403 |
| WebSocket `/ws/alerts` | all alerts | own reports' alerts | closed with 4403 |

"Own reports" = reports whose owner in the **latest** snapshot is the user's email.

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

Counts for the latest snapshot.
```json
{ "snapshot": 20, "totalReports": 100, "refreshFailed": 25, "slowOver15s": 76, "orphaned": 14, "statusUnknown": 5 }
```

### `GET /api/v1/reports?status=FAILED`

Reports in the latest snapshot. Optional `status`: `SUCCESS`, `FAILED`, `TIMED_OUT`, `UNKNOWN`.
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
      "rawCredits": 1029.31, "awsPerView": 0.027
    }
  ]
}
```
Viewers receive the same objects without `owner`, `credits`, `rawCredits`, `awsUsd` and `awsPerView`. `credits` is `null` when the source value was negative (quarantined); `rawCredits` keeps the original.

### `GET /api/v1/reports/:id`

All 20 snapshots of one report: `{ "reportId": "RPT_203", "history": [ <report object>, ... ] }`. `404` if not found or not visible to the caller.

### `GET /api/v1/reports/orphans` (admin)

`{ "count": 14, "reports": [ <report object>, ... ] }`. Rule: owner missing (blank, the text `nan`, or `ORPHANED_REPORT`) in the latest snapshot.

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

Each alert:
```json
{
  "type": "alert",
  "id": "a-193",
  "rule": "LATENCY_CRITICAL",
  "severity": "critical",
  "reportId": "RPT_204",
  "reportName": "Analytics Dashboard 5",
  "owner": "user_5@company.com",
  "value": 53.4,
  "threshold": 30,
  "snapshot": 1,
  "message": "Analytics Dashboard 5 loaded in 53.4 s (critical > 30 s)",
  "at": "2026-10-13T07:15:02.114Z"
}
```

### Alert rules

| Rule | Fires when | Severity | Pushed? |
|---|---|---|---|
| `LATENCY_WARN` | 15 s < load ≤ 30 s (the brief's threshold) | warning | No: shown on the dashboard, not pushed |
| `LATENCY_CRITICAL` | load > 30 s | critical | Yes |
| `REFRESH_FAILED` | status `FAILED` or `TIMED_OUT` | critical | Yes |
| `STATUS_UNKNOWN` | status `UNKNOWN` | data-quality | Yes |

**Alert on change:** a report + rule pair alerts when a breach **starts**, stays quiet while it continues, and can alert again after it recovers.

### Close codes

| Code | Meaning |
|---|---|
| 4401 | Missing or invalid token (like HTTP 401) |
| 4403 | Role not allowed to receive alerts, i.e. viewer (like HTTP 403) |

### Reliability

- The server pings every client every 30 s, so dead connections are detected.
- The dashboard reconnects with exponential backoff (1 s, 2 s, 4 s … up to 15 s), then calls `GET /alerts?since=<last id>` to fetch anything it missed.
- Alert state resets on logout, so one user never sees another user's alerts.
