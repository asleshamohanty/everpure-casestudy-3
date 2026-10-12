const fs = require("fs");
const { parse } = require("csv-parse/sync");

const text = fs.readFileSync("data/raw/reports.csv", "utf8");
const rows = parse(text, { columns: true });

// Convert text columns into numbers so we can compare them
for (const row of rows) {
  row.monthly_active_views = Number(row.monthly_active_views);
  row.snowflake_credits_consumed = Number(row.snowflake_credits_consumed);
  row.avg_load_time_sec = Number(row.avg_load_time_sec);
  row.aws_hosting_cost_usd = Number(row.aws_hosting_cost_usd);
  row.concurrent_user_peak = Number(row.concurrent_user_peak);
}

// Defect 1: orphaned owner (blank, the text "nan", or the tag ORPHANED_REPORT)
const orphanRows = rows.filter(
  (row) =>
    row.owner_email === "" ||
    row.owner_email === "nan" ||
    row.owner_email === "ORPHANED_REPORT"
);

// Defect 2: negative Snowflake credits
const negativeCredits = rows.filter((row) => row.snowflake_credits_consumed < 0);

// Defect 3: load time over the 15-second threshold
const slowLoads = rows.filter((row) => row.avg_load_time_sec > 15);

// Refresh failures (FAILED or TIMED_OUT)
const failedRefreshes = rows.filter(
  (row) => row.last_refresh_status === "FAILED" || row.last_refresh_status === "TIMED_OUT"
);

// Extra problem: zero views but real cost
const zeroViews = rows.filter((row) => row.monthly_active_views === 0);

console.log("Total rows:          ", rows.length);
console.log("Orphaned owner rows: ", orphanRows.length);
console.log("Negative credits:    ", negativeCredits.length);
console.log("Loads over 15 s:     ", slowLoads.length);
console.log("Failed refreshes:    ", failedRefreshes.length);
console.log("Zero-view rows:      ", zeroViews.length);

// Extra problem: more people at once than visited all month (impossible)
const impossiblePeak = rows.filter(
  (row) => row.concurrent_user_peak > row.monthly_active_views
);

// Extra problem: refresh status we can't interpret
const unknownStatus = rows.filter((row) => row.last_refresh_status === "UNKNOWN");

console.log("Peak above views:    ", impossiblePeak.length);
console.log("Unknown status:      ", unknownStatus.length);