import { useApi } from "../useApi";

export default function DataQuality({ token }) {
  const { data, error, loading } = useApi("/data-quality", token);
  return (
    <section className="card">
      <h2>Data quality</h2>
      <p className="muted small">Every rule run on the source CSV, what it found and what we did. Nothing was deleted silently.</p>
      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}
      {data && (
        <table>
          <thead><tr><th>Rule</th><th>Source</th><th className="num">Rows</th><th>Action</th><th>Reason</th></tr></thead>
          <tbody>
            {data.rules.map((r) => (
              <tr key={r.rule}>
                <td><strong>{r.rule}</strong></td>
                <td>{r.source}</td>
                <td className="num">{r.rows_affected}</td>
                <td>{r.action}</td>
                <td className="muted">{r.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
