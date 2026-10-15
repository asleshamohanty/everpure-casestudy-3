# Write-up: how I approached the case

this elaborates how I worked through the data, why each part is built the way it is, and what I found. The numbers come from the scripts in this repo, and `npm test` reproduces them.


## Starting with the data

Analysing the csv provided : it has 2,000 rows - 100 reports, each appearing 20 times, with no date column. All four defects from the brief were there, plus a few more:

- **Orphaned owners.** My first check found 117 rows. The real number is 245, because 128 "missing" owners were stored as the literal text `nan`, which is what pandas writes for an empty value. A JavaScript check for an empty string misses them all.
- **Negative Snowflake credits** (24 rows). I quarantined them rather than setting them to zero, and proved the totals still add up: raw credits minus quarantined credits equals clean credits, to the cent.
- **Load times up to 55 seconds.** These are the signal, not an error, so I kept them and used them for alerting.
- **AWS cost that has nothing to do with usage.** The correlation between views and hosting cost is about zero. I flagged the top 5% of cost per view and every row with zero views (103 rows).

Some things looked like defects but were not, once I tested them. For example, timed-out refreshes seemed to load faster than successful ones, but a t-test gave p = 0.45, which is noise. I wrote that up as noise instead of a finding.

## Task 1: the dashboard

The Node.js/Express server reads the cleaned data and serves a REST API. Every request goes through two checks: who you are (no valid token gives a 401) and whether your role may see this (wrong role gives a 403). The React dashboard only shows the tabs a role can use, but that is a convenience. The server is what enforces access, and the tests call the API directly to prove it.

To make it behave like a real monitor, the server replays the 20 snapshots as a live feed, one every 3 seconds. The health tiles, the report table and the statuses all follow it. Clicking a report opens its full 20-snapshot history.

Ownership turned out to be messy: one report had 10 different owners across 20 rows. I treated ownership as a register that starts from the latest snapshot and that only an admin changes, with every change audited and saved. An orphaned report can be assigned an owner from the dashboard, and the orphan count updates everywhere straight away.

## Task 2: real-time alerts

Alerts are pushed over a WebSocket the moment a report crosses 15 seconds (warning), crosses 30 seconds (critical), or its refresh fails. While testing I found that 75% of loads are slower than 15 seconds, and with refresh failures 82% of rows breach the brief's rule, so one alert per breaching row would bury the real problems. My engine alerts once when a problem starts and stays quiet while it continues. That is 1,109 alerts instead of 1,636 (32% fewer) without missing any breach the brief asks about.

If the connection drops, the dashboard reconnects with increasing delays and fetches any alerts it missed. Viewers are not allowed on the alert channel, and owners only receive alerts for their own reports.

## Task 3: cost attribution in Snowflake SQL

I wrote the SQL in Snowflake syntax against simulated versions of Snowflake's own billing views, `QUERY_ATTRIBUTION_HISTORY` and `WAREHOUSE_METERING_HISTORY`, following Snowflake's documented way of attributing cost. Without a Snowflake account, I test the same files locally in DuckDB. The suite loads the raw CSV as text, cleans it with `TRY_CAST`, merges it in a way that can safely run twice, quarantines the negative credits, attributes credits to each report (spreading warehouse idle time proportionally), and calculates cost per active view with zero views handled.

`05_checks.sql` runs 10 checks after every load. The one I like most compares the SQL with the Node.js API: both independently say the most expensive report is RPT_223 at $4.99 per view.

## Going beyond the brief: from seeing problems to fixing them

Once the monitoring worked, the obvious question was "so what should we do?" The **fix-it queue** answers it. Four transparent rules (refresh keeps failing, chronically slow, no owner and costly, refreshing with no viewers) produce a ranked list, and every item shows the rule, the numbers behind it and a recommended action. Only the cost rules carry a dollar estimate, and a report is counted once, so the spend-at-stake figure cannot be inflated.

I also tried a feature that did not make it. The idea was to suggest an owner for each orphaned report, based on who owned it most often before. I backtested it on the 86 reports whose owner is known: it was right 3% of the time, which is worse than a random guess (7%). So I documented it and did not ship it.

---

## What I found

- **39 of 100 reports need action**, with up to **~$318K of spend at stake** (7.8% of spend, at an assumed $3 per credit) if the flagged reports are retired or their idle refreshes paused: 14 refreshes keep failing, 22 reports are chronically slow, 7 are orphaned and costly, 4 keep refreshing with nobody looking.
- **14 reports have no owner** and account for **14.4% of all spend**.
- **75% of loads are slower than 15 seconds** (1,490 of 2,000), and 82% of rows breach the brief's rule once failed refreshes are included. The alerting threshold in the brief is breached so often that alerting has to be smart about it.
- **RPT_223 is the most expensive report per view** at $4.99. The median is about $2.71.
- **4 snapshots had zero views but still cost money**, for example RPT_230 at about $2,575 of Snowflake compute (858 credits at $3).
- **Thresholds matter.** Moving "chronic failure" from 8 to 7 failed refreshes out of 20 flags 37 reports instead of 14, so the thresholds should be agreed with the platform team before anyone acts on the counts.
