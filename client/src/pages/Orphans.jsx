import { useState } from "react";
import { useApi } from "../useApi";
import { api } from "../api";

export default function Orphans({ token, tick }) {
  const [changed, setChanged] = useState(0); // bump after an assignment to reload
  const { data, error, loading } = useApi("/reports/orphans", token, tick + changed);
  const audit = useApi("/ownership/audit", token, tick + changed);

  return (
    <>
      <section className="card">
        <h2>Orphaned reports</h2>
        <p className="muted small">
          A report is orphaned when nobody is registered as its owner. The registry starts from the latest
          snapshot in the data (blank, the text "nan" and ORPHANED_REPORT all count as no owner); admins can assign owners here.
        </p>
        {loading && <p className="muted">Loading…</p>}
        {error && <p className="error">{error}</p>}
        {data && (
          <>
            <p><strong>{data.count}</strong> reports have nobody responsible for fixing or retiring them.</p>
            <table>
              <thead><tr><th>Report</th><th>Refresh</th><th className="num">Views</th><th>Assign owner</th></tr></thead>
              <tbody>
                {data.reports.map((r) => (
                  <tr key={r.reportId}>
                    <td><span className="id">{r.reportId}</span> <span className="muted">{r.reportName}</span></td>
                    <td>{r.status}</td>
                    <td className="num">{r.views.toLocaleString()}</td>
                    <td><AssignForm id={r.reportId} token={token} onDone={() => setChanged((c) => c + 1)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className="card">
        <h2>Ownership changes</h2>
        {audit.data?.count === 0 && <p className="muted">No changes yet.</p>}
        {audit.data?.count > 0 && (
          <table>
            <thead><tr><th>When</th><th>By</th><th>Report</th><th>From</th><th>To</th></tr></thead>
            <tbody>
              {audit.data.changes.map((c) => (
                <tr key={c.at + c.reportId}>
                  <td className="small">{new Date(c.at).toLocaleTimeString()}</td>
                  <td>{c.by}</td>
                  <td className="id">{c.reportId}</td>
                  <td className="muted">{c.from ?? "none"}</td>
                  <td>{c.to ?? "none"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function AssignForm({ id, token, onDone }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setError(null);
    try {
      await api(`/reports/${id}/owner`, token, { method: "PATCH", body: { owner: email } });
      setEmail("");
      onDone();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="assign" onSubmit={submit}>
      <input type="email" required placeholder="owner@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button className="primary small-btn" type="submit">Assign</button>
      {error && <span className="error small">{error}</span>}
    </form>
  );
}
