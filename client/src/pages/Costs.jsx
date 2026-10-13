import { useApi } from "../useApi";

const usd = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function Costs({ token }) {
  const { data, error, loading } = useApi("/costs", token);
  return (
    <section className="card">
      <h2>Cost per report</h2>
      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <p className="muted small">
            All 20 snapshots. Cost per view = (credits × ${data.pricePerCreditUsd} + AWS hosting) ÷ views.
            ${data.pricePerCreditUsd} per credit is an assumption. Negative credits are excluded.
          </p>
          <table>
            <thead>
              <tr><th>Report</th><th className="num">Credits</th><th className="num">AWS</th><th className="num">Views</th><th className="num">Cost per view</th></tr>
            </thead>
            <tbody>
              {data.reports.map((r) => (
                <tr key={r.reportId}>
                  <td><span className="id">{r.reportId}</span></td>
                  <td className="num">{Math.round(r.credits).toLocaleString()}</td>
                  <td className="num">{usd(r.awsUsd)}</td>
                  <td className="num">{r.views.toLocaleString()}</td>
                  <td className="num"><strong>{r.costPerViewUsd === null ? "no views" : `$${r.costPerViewUsd.toFixed(2)}`}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
