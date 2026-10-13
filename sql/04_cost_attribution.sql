-- =====================================================================
-- 04_cost_attribution.sql  |  Attribute Snowflake credits to reports,
-- compute unit cost per active view, and surface wasted spend.
-- Method follows Snowflake's documented approach: per-query attributed
-- credits, with warehouse idle time spread proportionally.
-- =====================================================================

-- 1. Quarantine: negative credits are kept for audit, never summed into cost.
CREATE OR REPLACE TABLE REPORTING.CREDIT_ANOMALIES AS
SELECT q.*, 'NEGATIVE_CREDITS' AS anomaly_type
FROM SIM_ACCOUNT_USAGE.QUERY_ATTRIBUTION_HISTORY q
WHERE q.credits_attributed_compute < 0;

-- 2. The main table: one row per report.
CREATE OR REPLACE TABLE REPORTING.REPORT_COST_ATTRIBUTION AS
WITH clean_credits AS (            -- attributed credits per report, negatives excluded
    SELECT query_tag AS report_id,
           SUM(credits_attributed_compute) AS attributed_credits
    FROM SIM_ACCOUNT_USAGE.QUERY_ATTRIBUTION_HISTORY
    WHERE credits_attributed_compute >= 0
    GROUP BY query_tag
),
totals AS (                        -- what queries account for vs what was billed
    SELECT (SELECT SUM(attributed_credits) FROM clean_credits)                          AS total_attributed,
           (SELECT SUM(credits_used_compute) FROM SIM_ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY) AS total_metered
),
usage AS (                         -- views and hosting cost across all snapshots
    SELECT report_id,
           SUM(monthly_active_views) AS views,
           SUM(aws_hosting_cost_usd) AS aws_usd
    FROM REPORTING.REPORT_SNAPSHOT
    GROUP BY report_id
),
latest AS (                        -- current owner = owner in the latest snapshot
    SELECT report_id, owner_email, owner_missing
    FROM REPORTING.REPORT_SNAPSHOT
    QUALIFY ROW_NUMBER() OVER (PARTITION BY report_id ORDER BY snapshot DESC) = 1
),
priced AS (
    SELECT
        u.report_id,
        l.owner_email                                         AS current_owner,
        l.owner_missing                                       AS is_orphaned,
        COALESCE(c.attributed_credits, 0)                     AS attributed_credits,
        COALESCE(c.attributed_credits, 0) / t.total_attributed * t.total_metered AS allocated_credits,
        u.views,
        u.aws_usd,
        cfg.price_per_credit_usd
    FROM usage u
    JOIN latest l          ON l.report_id = u.report_id
    LEFT JOIN clean_credits c ON c.report_id = u.report_id
    CROSS JOIN totals t
    CROSS JOIN REPORTING.COST_CONFIG cfg
)
SELECT
    report_id,
    current_owner,
    is_orphaned,
    ROUND(attributed_credits, 2)                                            AS attributed_credits,
    ROUND(allocated_credits, 2)                                             AS allocated_credits_incl_idle,
    views,
    aws_usd,
    ROUND(attributed_credits * price_per_credit_usd, 2)                     AS snowflake_usd,
    -- NULLIF turns a zero denominator into NULL: "no usage", never a crash or Infinity
    ROUND((attributed_credits * price_per_credit_usd + aws_usd) / NULLIF(views, 0), 4) AS cost_per_view_usd,
    ROUND((allocated_credits  * price_per_credit_usd + aws_usd) / NULLIF(views, 0), 4) AS cost_per_view_incl_idle_usd,
    RANK() OVER (ORDER BY (attributed_credits * price_per_credit_usd + aws_usd) / NULLIF(views, 0) DESC NULLS LAST) AS cost_rank
FROM priced;

-- 3. Views that answer the questions finance and the platform team will ask.

-- Top 10 most expensive reports per view
CREATE OR REPLACE VIEW REPORTING.V_TOP_COST_PER_VIEW AS
SELECT cost_rank, report_id, current_owner, views, snowflake_usd, aws_usd, cost_per_view_usd
FROM REPORTING.REPORT_COST_ATTRIBUTION
WHERE cost_rank <= 10;

-- Spend on reports nobody owns
CREATE OR REPLACE VIEW REPORTING.V_ORPHAN_SPEND AS
SELECT COUNT(*)                                AS orphaned_reports,
       ROUND(SUM(snowflake_usd + aws_usd), 2)  AS total_spend_usd,
       ROUND(100 * SUM(snowflake_usd + aws_usd) /
             (SELECT SUM(snowflake_usd + aws_usd) FROM REPORTING.REPORT_COST_ATTRIBUTION), 1) AS pct_of_all_spend
FROM REPORTING.REPORT_COST_ATTRIBUTION
WHERE is_orphaned;

-- Spend in snapshots where a report had zero views ("cost without usage")
CREATE OR REPLACE VIEW REPORTING.V_IDLE_REPORT_SPEND AS
SELECT s.report_id, s.snapshot,
       GREATEST(COALESCE(s.credits_raw, 0), 0) * cfg.price_per_credit_usd AS snowflake_usd,
       s.aws_hosting_cost_usd                                              AS aws_usd
FROM REPORTING.REPORT_SNAPSHOT s
CROSS JOIN REPORTING.COST_CONFIG cfg
WHERE s.monthly_active_views = 0;

-- Defect 4: AWS hosting cost vs active usage.
-- AWS cost per view, per snapshot. Flag the top 5% (above the 95th percentile)
-- and every snapshot with zero views as "cost without usage". Same rule as clean.js,
-- so check #10 can prove the two implementations agree.
CREATE OR REPLACE VIEW REPORTING.V_AWS_COST_VS_USAGE AS
WITH per_view AS (
    SELECT report_id, snapshot, monthly_active_views, concurrent_user_peak, aws_hosting_cost_usd,
           aws_hosting_cost_usd / NULLIF(monthly_active_views, 0) AS aws_per_view_usd
    FROM REPORTING.REPORT_SNAPSHOT
),
p95 AS (
    SELECT PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY aws_per_view_usd) AS cutoff
    FROM per_view
    WHERE aws_per_view_usd IS NOT NULL
)
SELECT v.*,
       ROUND(p95.cutoff, 4) AS p95_cutoff_usd,
       CASE WHEN v.aws_per_view_usd IS NULL THEN 'ZERO_VIEWS'
            WHEN v.aws_per_view_usd > p95.cutoff THEN 'ABOVE_P95'
       END AS discrepancy
FROM per_view v
CROSS JOIN p95;
