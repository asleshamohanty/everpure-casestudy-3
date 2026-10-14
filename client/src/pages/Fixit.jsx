import { useApi } from "../useApi";

// $317,568 -> "$318K", $4,081,007 -> "$4.08M": fits a tile; the exact value is shown underneath
const compact = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: n >= 1e6 ? 2 : 0 });
const usd = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const RULE_LABEL = {
  CHRONIC_REFRESH_FAILURE: "Refresh keeps failing",
  CHRONIC_SLOW: "Chronically slow",
  ORPHANED_AND_COSTLY: "No owner, costly",
  REFRESHING_WITHOUT_USERS: "Refreshing with no viewers",
};
const IMPACT_CLASS = { reliability: "bad", "user experience": "warn", cost: "dq" };

// What to fix first, why, and what it is worth. Every line names the rule and the numbers.
export default function Fixit({ token, tick }) {
  const { data, error, loading } = useApi("/fixit", token, tick);
  if (loading) return <p className="muted">Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  const { summary, assumptions, items } = data;

  return (
    <>
      <section className="kpis">
        <div className="card kpi"><span className="kpi-value">{summary.reportsNeedingAction}</span><span className="muted">Reports needing action</span></div>
        <div className="card kpi warn" title={`Exactly ${usd(summary.estimatedSavingsUsd)}`}>
          <span className="kpi-value">{compact(summary.estimatedSavingsUsd)}</span>
          <span className="muted">Estimated savings</span>
          <span className="muted small">{usd(summary.estimatedSavingsUsd)} · {((100 * summary.estimatedSavingsUsd) / summary.totalSpendUsd).toFixed(1)}% of {compact(summary.totalSpendUsd)} spend</span>
        </div>
        {Object.entries(summary.byRule).map(([rule, n]) => (
          <div key={rule} className="card kpi"><span className="kpi-value">{n}</span><span className="muted">{RULE_LABEL[rule]}</span></div>
        ))}
      </section>
      <p className="muted small">
        Rules: refresh failed in ≥ {assumptions.chronicFailureMin} of 20 snapshots · over 15 s in ≥ {assumptions.chronicSlowMin} of 20 ·
        no owner and cost per view above the median (${assumptions.medianCostPerView.toFixed(2)}) · zero views but still refreshing.
        Savings are estimates at ${assumptions.pricePerCredit} per credit; a report counts once, at its largest cost finding.
        Reliability problems carry no dollar figure.
      </p>

      <section className="card">
        <h2>Fix-it queue</h2>
        <table>
          <thead><tr><th className="num">#</th><th>Report</th><th>Problem and evidence</th><th>Recommended action</th><th className="num">Est. savings</th></tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.reportId} className="top">
                <td className="num">{it.priority}</td>
                <td><span className="id">{it.reportId}</span><div className="muted small">{it.owner ?? <span className="pill warn">No owner</span>}</div></td>
                <td>{it.findings.map((f) => (
                  <div key={f.rule} className="finding">
                    <span className={`pill ${IMPACT_CLASS[f.impact]}`}>{RULE_LABEL[f.rule]}</span>
                    <div className="muted small wrap">{f.evidence}</div>
                  </div>))}
                </td>
                <td>{it.findings.map((f) => <div key={f.rule} className="small wrap finding">{f.action}</div>)}</td>
                <td className="num">{it.savingsUsd > 0 ? <strong>{usd(it.savingsUsd)}</strong> : <span className="muted">–</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
