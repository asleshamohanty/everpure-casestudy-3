"""
Runs the Snowflake SQL suite locally with DuckDB, against the real CSV.
Usage (from the project root):   python3 scripts/run_sql.py
Needs:                            pip3 install duckdb

Why DuckDB? We have no Snowflake account for this case study. DuckDB understands
almost all of the SQL we use (MERGE, QUALIFY, window functions), so the same
files are tested here and would run in Snowflake. The only Snowflake-only part
(stage + COPY INTO) is marked in 02_load.sql and replaced below by a local CSV load.
"""
import re
import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
SQL = ROOT / "sql"
CSV = ROOT / "data" / "raw" / "reports.csv"


def read_sql(name):
    text = (SQL / name).read_text()
    # Drop the Snowflake-only block (stage + COPY INTO)
    return re.sub(r"-- \[snowflake-only:start\].*?-- \[snowflake-only:end\]", "", text, flags=re.S)


def show(con, title, query):
    print(f"\n== {title}")
    result = con.execute(query)
    cols = [d[0] for d in result.description]
    rows = result.fetchall()
    widths = [max(len(str(c)), *(len(str(r[i])) for r in rows)) if rows else len(c) for i, c in enumerate(cols)]
    print("  ".join(str(c).ljust(w) for c, w in zip(cols, widths)))
    for r in rows:
        print("  ".join(str(v).ljust(w) for v, w in zip(r, widths)))
    return rows


con = duckdb.connect()                    # in-memory database, nothing to install or clean up
con.execute("SET threads = 1")            # keep CSV row order stable

con.execute(read_sql("01_ddl.sql"))
print("01_ddl.sql            tables created")

# Local replacement for Snowflake's PUT + COPY INTO: load the CSV as text, keep its row order
con.execute(f"""
    INSERT INTO REPORTING.STG_REPORTS_RAW
    SELECT ROW_NUMBER() OVER () AS file_row_number, *
    FROM read_csv('{CSV}', header = true, all_varchar = true)
""")
con.execute(read_sql("02_load.sql"))
print("02_load.sql           CSV loaded and cleaned into REPORT_SNAPSHOT")

con.execute(read_sql("03_simulate_account_usage.sql"))
print("03_simulate_...sql    simulated ACCOUNT_USAGE logs built")

con.execute(read_sql("04_cost_attribution.sql"))
print("04_cost_attribution   cost tables and views built")

# Run the load a second time: MERGE must not create duplicates (idempotency)
con.execute(read_sql("02_load.sql"))

show(con, "Top 10 reports by cost per view", "SELECT * FROM REPORTING.V_TOP_COST_PER_VIEW ORDER BY cost_rank")
show(con, "Spend on orphaned reports", "SELECT * FROM REPORTING.V_ORPHAN_SPEND")
show(con, "Spend with zero views", "SELECT * FROM REPORTING.V_IDLE_REPORT_SPEND ORDER BY report_id")
show(con, "Defect 4: AWS cost vs usage (worst 5)",
     "SELECT report_id, snapshot, monthly_active_views, aws_hosting_cost_usd, ROUND(aws_per_view_usd, 2) AS aws_per_view_usd, discrepancy "
     "FROM REPORTING.V_AWS_COST_VS_USAGE WHERE discrepancy IS NOT NULL ORDER BY aws_per_view_usd DESC NULLS FIRST LIMIT 5")
checks = show(con, "05_checks.sql", read_sql("05_checks.sql"))

failed = [c for c in checks if not c[3]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
sys.exit(1 if failed else 0)
