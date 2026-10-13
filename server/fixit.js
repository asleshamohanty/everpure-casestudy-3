// Fix-it queue: turns 20 snapshots of telemetry into a ranked list of actions.
// Deliberately rule-based: every recommendation names the rule that fired and the
// numbers behind it, so a person can check it by hand. No model: with 20 synthetic
// snapshots a model would fit noise (see docs/DATA_QUALITY.md, owner backtest).

const DEFAULTS = {
  chronicFailureMin: 8,   // refresh failed in at least 8 of 20 snapshots
  chronicSlowMin: 17,     // loaded in over 15 s in at least 17 of 20 snapshots
  pricePerCredit: 3,      // assumption: depends on Everpure's Snowflake contract
};

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

function buildFixitQueue(rows, owners, options = {}) {
  const cfg = { ...DEFAULTS, ...options };

  // 1. Per-report history totals
  const reports = {};
  for (const r of rows) {
    const t = (reports[r.reportId] ||= {
      reportId: r.reportId, reportName: r.reportName, snapshots: 0, failed: 0, slow: 0,
      loads: [], credits: 0, awsUsd: 0, views: 0, idleSnapshots: 0, idleSpendUsd: 0,
    });
    const spend = (r.credits ?? 0) * cfg.pricePerCredit + r.awsUsd;
    t.snapshots += 1;
    t.failed += r.flags.refreshFailed ? 1 : 0;
    t.slow += r.loadSec > 15 ? 1 : 0;
    t.loads.push(r.loadSec);
    t.credits += r.credits ?? 0;
    t.awsUsd += r.awsUsd;
    t.views += r.views;
    if (r.views === 0) { t.idleSnapshots += 1; t.idleSpendUsd += spend; }
  }
  const list = Object.values(reports).map((t) => {
    const spendUsd = t.credits * cfg.pricePerCredit + t.awsUsd;
    return { ...t, spendUsd, costPerView: t.views > 0 ? spendUsd / t.views : null, owner: owners[t.reportId] ?? null };
  });
  const medianCostPerView = median(list.filter((t) => t.costPerView !== null).map((t) => t.costPerView));
  const totalSpendUsd = list.reduce((s, t) => s + t.spendUsd, 0);

  // 2. Rules -> findings. Only cost rules carry a dollar estimate; reliability rules do not
  //    (we do not invent the cost of an outage).
  const items = [];
  for (const t of list) {
    const findings = [];
    if (t.failed >= cfg.chronicFailureMin) findings.push({
      rule: "CHRONIC_REFRESH_FAILURE", impact: "reliability", savingsUsd: 0,
      evidence: `refresh failed in ${t.failed} of ${t.snapshots} snapshots (rule: at least ${cfg.chronicFailureMin})`,
      action: "Investigate the refresh job (schema change, credentials, timeout); retry with backoff; notify the owner",
    });
    if (t.slow >= cfg.chronicSlowMin) findings.push({
      rule: "CHRONIC_SLOW", impact: "user experience", savingsUsd: 0,
      evidence: `over 15 s in ${t.slow} of ${t.snapshots} snapshots, median ${median(t.loads).toFixed(1)} s (rule: at least ${cfg.chronicSlowMin})`,
      action: "Pre-compute the data (extract or materialized view) or cache it; review the query",
    });
    if (t.owner === null && t.costPerView !== null && t.costPerView > medianCostPerView) findings.push({
      rule: "ORPHANED_AND_COSTLY", impact: "cost", savingsUsd: t.spendUsd,
      evidence: `no owner; $${t.costPerView.toFixed(2)} per view vs median $${medianCostPerView.toFixed(2)}`,
      action: "Assign an owner, or retire the report (estimate = its full spend)",
    });
    if (t.idleSnapshots > 0) findings.push({
      rule: "REFRESHING_WITHOUT_USERS", impact: "cost", savingsUsd: t.idleSpendUsd,
      evidence: `${t.idleSnapshots} snapshot(s) with zero views still cost $${t.idleSpendUsd.toFixed(0)}`,
      action: "Pause scheduled refreshes when a report has no viewers",
    });
    if (findings.length === 0) continue;

    // No double counting: a report's estimate is its LARGEST cost finding, not the sum
    // (retiring a report already removes its idle spend).
    const savingsUsd = Math.max(...findings.map((f) => f.savingsUsd));
    items.push({ reportId: t.reportId, reportName: t.reportName, owner: t.owner, savingsUsd, findings });
  }

  // 3. Priority: reports with more problems first, then by money at stake
  items.sort((a, b) => b.findings.length - a.findings.length || b.savingsUsd - a.savingsUsd);
  items.forEach((it, i) => (it.priority = i + 1));

  const count = (rule) => items.filter((it) => it.findings.some((f) => f.rule === rule)).length;
  return {
    assumptions: { ...cfg, medianCostPerView: Number(medianCostPerView.toFixed(4)) },
    summary: {
      reportsNeedingAction: items.length,
      estimatedSavingsUsd: items.reduce((s, it) => s + it.savingsUsd, 0),
      totalSpendUsd,
      byRule: {
        CHRONIC_REFRESH_FAILURE: count("CHRONIC_REFRESH_FAILURE"),
        CHRONIC_SLOW: count("CHRONIC_SLOW"),
        ORPHANED_AND_COSTLY: count("ORPHANED_AND_COSTLY"),
        REFRESHING_WITHOUT_USERS: count("REFRESHING_WITHOUT_USERS"),
      },
    },
    items,
  };
}

module.exports = { buildFixitQueue, DEFAULTS };
