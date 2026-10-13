-- =====================================================================
-- 05_checks.sql  |  Reconciliation and sanity checks. Every row must say passed = TRUE.
-- Run after every load. In production these would feed an alert.
-- =====================================================================
WITH
raw_rows     AS (SELECT COUNT(*) AS n FROM REPORTING.STG_REPORTS_RAW),
snap         AS (SELECT COUNT(*) AS n, COUNT(DISTINCT report_id || '|' || CAST(snapshot AS VARCHAR)) AS distinct_keys
                 FROM REPORTING.REPORT_SNAPSHOT),
per_report   AS (SELECT report_id, COUNT(*) AS n FROM REPORTING.REPORT_SNAPSHOT GROUP BY report_id),
raw_credits  AS (SELECT SUM(credits_attributed_compute) AS v FROM SIM_ACCOUNT_USAGE.QUERY_ATTRIBUTION_HISTORY),
quarantined  AS (SELECT COUNT(*) AS n, SUM(credits_attributed_compute) AS v FROM REPORTING.CREDIT_ANOMALIES),
attributed   AS (SELECT SUM(attributed_credits) AS v, SUM(allocated_credits_incl_idle) AS alloc FROM REPORTING.REPORT_COST_ATTRIBUTION),
metered      AS (SELECT SUM(credits_used_compute) AS v FROM SIM_ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY),
cpv          AS (SELECT COUNT(*) AS bad FROM REPORTING.REPORT_COST_ATTRIBUTION
                 WHERE cost_per_view_usd < 0 OR (cost_per_view_usd IS NULL AND views > 0)),
top1         AS (SELECT report_id, cost_per_view_usd FROM REPORTING.REPORT_COST_ATTRIBUTION WHERE cost_rank = 1)
SELECT 'all 2,000 CSV rows loaded'                  AS check_name, '2000' AS expected, CAST(n AS VARCHAR) AS actual, n = 2000 AS passed FROM raw_rows
UNION ALL
SELECT 'no duplicate (report, snapshot) keys', '2000 / 2000', CAST(n AS VARCHAR) || ' / ' || CAST(distinct_keys AS VARCHAR), n = 2000 AND distinct_keys = 2000 FROM snap
UNION ALL
SELECT 'every report has 20 snapshots', '0 reports off', CAST(COUNT(*) AS VARCHAR) || ' reports off', COUNT(*) = 0 FROM per_report WHERE n <> 20
UNION ALL
SELECT 'negative-credit rows quarantined', '24', CAST(n AS VARCHAR), n = 24 FROM quarantined
UNION ALL
SELECT 'raw credits - quarantined = attributed', CAST(ROUND(r.v - q.v, 2) AS VARCHAR), CAST(ROUND(a.v, 2) AS VARCHAR),
       ABS((r.v - q.v) - a.v) < 0.01
FROM raw_credits r, quarantined q, attributed a
UNION ALL
SELECT 'allocated credits = metered credits', CAST(ROUND(m.v, 2) AS VARCHAR), CAST(ROUND(a.alloc, 2) AS VARCHAR),
       ABS(m.v - a.alloc) < 1
FROM metered m, attributed a
UNION ALL
SELECT 'cost per view never negative; NULL only with 0 views', '0 bad rows', CAST(bad AS VARCHAR) || ' bad rows', bad = 0 FROM cpv
UNION ALL
SELECT 'orphaned reports (latest snapshot)', '14', CAST(COUNT(*) AS VARCHAR), COUNT(*) = 14
FROM REPORTING.REPORT_COST_ATTRIBUTION WHERE is_orphaned
UNION ALL
SELECT 'SQL agrees with the API: top report', 'RPT_223 at 4.99', report_id || ' at ' || CAST(ROUND(cost_per_view_usd, 2) AS VARCHAR),
       report_id = 'RPT_223' AND ROUND(cost_per_view_usd, 2) = 4.99
FROM top1;
