import { useApi } from "../useApi";

export default function Orphans({ token }) {
  const { data, error, loading } = useApi("/reports/orphans", token);
  return (
    <section className="card">
      <h2>Orphaned reports</h2>
      <p className="muted small">
        Rule: a report is orphaned if its <strong>latest</strong> snapshot has no owner (blank, the text "nan", or ORPHANED_REPORT).
      </p>
      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <p><strong>{data.count}</strong> reports have nobody responsible for fixing or retiring them.</p>
          <table>
            <thead><tr><th>Report</th><th>Refresh</th><th className="num">Monthly views</th><th className="num">Credits (latest)</th></tr></thead>
            <tbody>
              {data.reports.map((r) => (
                <tr key={r.reportId}>
                  <td><span className="id">{r.reportId}</span> <span className="muted">{r.reportName}</span></td>
                  <td>{r.status}</td>
                  <td className="num">{r.views.toLocaleString()}</td>
                  <td className="num">{r.credits === null ? "quarantined" : r.credits.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
