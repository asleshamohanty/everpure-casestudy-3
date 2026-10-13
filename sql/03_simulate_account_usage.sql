-- =====================================================================
-- 03_simulate_account_usage.sql  |  Build simulated ACCOUNT_USAGE logs
-- In a real Snowflake account these views already exist in SNOWFLAKE.ACCOUNT_USAGE
-- and this whole file would be skipped.
-- =====================================================================

-- Illustrative dates: one snapshot per nightly refresh (assumption; the CSV has no dates)
DELETE FROM REPORTING.SNAPSHOT_CALENDAR;
INSERT INTO REPORTING.SNAPSHOT_CALENDAR (snapshot, period_start) VALUES
    (1, TIMESTAMP '2026-09-22 02:00:00'),
    (2, TIMESTAMP '2026-09-23 02:00:00'),
    (3, TIMESTAMP '2026-09-24 02:00:00'),
    (4, TIMESTAMP '2026-09-25 02:00:00'),
    (5, TIMESTAMP '2026-09-26 02:00:00'),
    (6, TIMESTAMP '2026-09-27 02:00:00'),
    (7, TIMESTAMP '2026-09-28 02:00:00'),
    (8, TIMESTAMP '2026-09-29 02:00:00'),
    (9, TIMESTAMP '2026-09-30 02:00:00'),
    (10, TIMESTAMP '2026-10-01 02:00:00'),
    (11, TIMESTAMP '2026-10-02 02:00:00'),
    (12, TIMESTAMP '2026-10-03 02:00:00'),
    (13, TIMESTAMP '2026-10-04 02:00:00'),
    (14, TIMESTAMP '2026-10-05 02:00:00'),
    (15, TIMESTAMP '2026-10-06 02:00:00'),
    (16, TIMESTAMP '2026-10-07 02:00:00'),
    (17, TIMESTAMP '2026-10-08 02:00:00'),
    (18, TIMESTAMP '2026-10-09 02:00:00'),
    (19, TIMESTAMP '2026-10-10 02:00:00'),
    (20, TIMESTAMP '2026-10-11 02:00:00');

-- Query attribution exactly as the "log" reports it, negative values included:
-- we simulate the defect, and handle it in 04, like we would with real data.
DELETE FROM SIM_ACCOUNT_USAGE.QUERY_ATTRIBUTION_HISTORY;
INSERT INTO SIM_ACCOUNT_USAGE.QUERY_ATTRIBUTION_HISTORY
SELECT
    s.report_id || '-S' || CAST(s.snapshot AS VARCHAR)   AS query_id,
    s.report_id                                           AS query_tag,
    'PORTAL_SVC'                                          AS user_name,
    'REPORTING_WH'                                        AS warehouse_name,
    c.period_start                                        AS start_time,
    s.credits_raw                                         AS credits_attributed_compute
FROM REPORTING.REPORT_SNAPSHOT s
JOIN REPORTING.SNAPSHOT_CALENDAR c ON c.snapshot = s.snapshot;

-- Warehouse metering: what was actually billed = busy credits + idle time.
DELETE FROM SIM_ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY;
INSERT INTO SIM_ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY
SELECT
    q.start_time,
    q.warehouse_name,
    ROUND(SUM(GREATEST(q.credits_attributed_compute, 0)) * (1 + MAX(cfg.idle_share)), 2) AS credits_used_compute
FROM SIM_ACCOUNT_USAGE.QUERY_ATTRIBUTION_HISTORY q
CROSS JOIN REPORTING.COST_CONFIG cfg
GROUP BY q.start_time, q.warehouse_name;
