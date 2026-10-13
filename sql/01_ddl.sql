-- =====================================================================
-- 01_ddl.sql  |  Pure Insights Command Center: Task 3 cost allocation
-- Creates the schemas and tables. Written in Snowflake SQL; also runs in
-- DuckDB for local testing (scripts/run_sql.py).
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS REPORTING;          -- our tables
CREATE SCHEMA IF NOT EXISTS SIM_ACCOUNT_USAGE;  -- simulated copies of Snowflake's SNOWFLAKE.ACCOUNT_USAGE views

-- Raw landing table: every column is text, exactly as it arrived in the CSV.
-- We never "fix" data on the way in; typing and cleaning happen in 02_load.sql.
CREATE OR REPLACE TABLE REPORTING.STG_REPORTS_RAW (
    file_row_number             INTEGER,
    report_id                   VARCHAR,
    report_name                 VARCHAR,
    owner_email                 VARCHAR,
    last_refresh_status         VARCHAR,
    monthly_active_views        VARCHAR,
    snowflake_credits_consumed  VARCHAR,
    avg_load_time_sec           VARCHAR,
    aws_hosting_cost_usd        VARCHAR,
    query_count_last_30d        VARCHAR,
    concurrent_user_peak        VARCHAR
);

-- One row per report per snapshot, typed and cleaned.
-- NOTE: Snowflake does NOT enforce PRIMARY KEY constraints (only NOT NULL).
-- We declare it for documentation and prove uniqueness in 05_checks.sql.
CREATE OR REPLACE TABLE REPORTING.REPORT_SNAPSHOT (
    report_id              VARCHAR       NOT NULL,
    report_name            VARCHAR,
    snapshot               INTEGER       NOT NULL,  -- 1..20, assumption: every 100 CSV rows = one snapshot
    owner_email            VARCHAR,                 -- NULL when missing ('', 'nan', 'ORPHANED_REPORT')
    owner_missing          BOOLEAN       NOT NULL,
    refresh_status         VARCHAR,
    monthly_active_views   INTEGER,
    credits_raw            DECIMAL(12,2),           -- as reported, may be negative
    avg_load_time_sec      DECIMAL(6,1),
    aws_hosting_cost_usd   DECIMAL(12,2),
    query_count_30d        INTEGER,
    concurrent_user_peak   INTEGER,
    PRIMARY KEY (report_id, snapshot)
);

-- Parameters kept in a table, not hard-coded in queries, so finance can audit and change them.
CREATE OR REPLACE TABLE REPORTING.COST_CONFIG (
    price_per_credit_usd   DECIMAL(8,2)  NOT NULL,  -- assumption: depends on the Snowflake contract
    idle_share             DECIMAL(4,2)  NOT NULL   -- simulated warehouse idle time, as a share of busy credits
);

-- Illustrative timestamps for the 20 snapshots (the CSV has none).
CREATE OR REPLACE TABLE REPORTING.SNAPSHOT_CALENDAR (
    snapshot       INTEGER    NOT NULL,
    period_start   TIMESTAMP  NOT NULL
);

-- Simulated SNOWFLAKE.ACCOUNT_USAGE.QUERY_ATTRIBUTION_HISTORY
-- (real view: one row per query; here one row per report per snapshot, already aggregated)
CREATE OR REPLACE TABLE SIM_ACCOUNT_USAGE.QUERY_ATTRIBUTION_HISTORY (
    query_id                     VARCHAR        NOT NULL,
    query_tag                    VARCHAR,        -- the portal tags every query with its report id
    user_name                    VARCHAR,
    warehouse_name               VARCHAR,
    start_time                   TIMESTAMP,
    credits_attributed_compute   DECIMAL(12,2)
);

-- Simulated SNOWFLAKE.ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY
-- (what the warehouse actually billed, including idle time no query is charged for)
CREATE OR REPLACE TABLE SIM_ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY (
    start_time             TIMESTAMP      NOT NULL,
    warehouse_name         VARCHAR        NOT NULL,
    credits_used_compute   DECIMAL(14,2)  NOT NULL
);
