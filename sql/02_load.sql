-- =====================================================================
-- 02_load.sql  |  Load the CSV, then type and clean it into REPORT_SNAPSHOT
-- =====================================================================

-- [snowflake-only:start]  (the local test runner loads the CSV itself instead)
CREATE OR REPLACE FILE FORMAT REPORTING.CSV_FMT
    TYPE = CSV  SKIP_HEADER = 1  FIELD_OPTIONALLY_ENCLOSED_BY = '"'  NULL_IF = ();
CREATE OR REPLACE STAGE REPORTING.RAW_STAGE FILE_FORMAT = REPORTING.CSV_FMT;
-- Upload from your machine with SnowSQL:  PUT file://data/raw/reports.csv @REPORTING.RAW_STAGE;
COPY INTO REPORTING.STG_REPORTS_RAW
FROM (
    SELECT METADATA$FILE_ROW_NUMBER, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
    FROM @REPORTING.RAW_STAGE
)
ON_ERROR = 'ABORT_STATEMENT';   -- a bad file stops the load instead of half-loading
-- [snowflake-only:end]

-- Parameters (stated assumptions)
DELETE FROM REPORTING.COST_CONFIG;
INSERT INTO REPORTING.COST_CONFIG VALUES (3.00, 0.10);

-- Typed, cleaned rows. MERGE makes the load idempotent: running it twice
-- updates rows instead of duplicating them.
MERGE INTO REPORTING.REPORT_SNAPSHOT AS tgt
USING (
    SELECT
        TRIM(report_id)                                           AS report_id,
        TRIM(report_name)                                         AS report_name,
        FLOOR((ROW_NUMBER() OVER (ORDER BY file_row_number) - 1) / 100) + 1 AS snapshot,
        CASE WHEN TRIM(COALESCE(owner_email, '')) IN ('', 'nan', 'ORPHANED_REPORT')
             THEN NULL ELSE TRIM(owner_email) END                 AS owner_email,
        TRIM(COALESCE(owner_email, '')) IN ('', 'nan', 'ORPHANED_REPORT') AS owner_missing,
        UPPER(TRIM(last_refresh_status))                          AS refresh_status,
        TRY_CAST(monthly_active_views       AS INTEGER)           AS monthly_active_views,
        TRY_CAST(snowflake_credits_consumed AS DECIMAL(12,2))     AS credits_raw,
        TRY_CAST(avg_load_time_sec          AS DECIMAL(6,1))      AS avg_load_time_sec,
        TRY_CAST(aws_hosting_cost_usd       AS DECIMAL(12,2))     AS aws_hosting_cost_usd,
        TRY_CAST(query_count_last_30d       AS INTEGER)           AS query_count_30d,
        TRY_CAST(concurrent_user_peak       AS INTEGER)           AS concurrent_user_peak
    FROM REPORTING.STG_REPORTS_RAW
) AS src
ON tgt.report_id = src.report_id AND tgt.snapshot = src.snapshot
WHEN MATCHED THEN UPDATE SET
    report_name = src.report_name, owner_email = src.owner_email, owner_missing = src.owner_missing,
    refresh_status = src.refresh_status, monthly_active_views = src.monthly_active_views,
    credits_raw = src.credits_raw, avg_load_time_sec = src.avg_load_time_sec,
    aws_hosting_cost_usd = src.aws_hosting_cost_usd, query_count_30d = src.query_count_30d,
    concurrent_user_peak = src.concurrent_user_peak
WHEN NOT MATCHED THEN INSERT (
    report_id, report_name, snapshot, owner_email, owner_missing, refresh_status, monthly_active_views,
    credits_raw, avg_load_time_sec, aws_hosting_cost_usd, query_count_30d, concurrent_user_peak
) VALUES (
    src.report_id, src.report_name, src.snapshot, src.owner_email, src.owner_missing, src.refresh_status,
    src.monthly_active_views, src.credits_raw, src.avg_load_time_sec, src.aws_hosting_cost_usd,
    src.query_count_30d, src.concurrent_user_peak
);
