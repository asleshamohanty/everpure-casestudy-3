import { useState } from "react";
import { useApi } from "../useApi";

const STATUS_CLASS = { SUCCESS: "ok", FAILED: "bad", TIMED_OUT: "bad", UNKNOWN: "warn" };

export default function Overview({ token, role }) {
  const [status, setStatus] = useState("");
  const summary = useApi("/health/summary", token);
  const reports = useApi(`/reports${status ? `?status=${status}` : ""}`, token);

  return (
    <>
      {summary.error && <p className="error">{summary.error}</p>}
      {summary.data && (
        <section className="kpis">
          <Kpi label="Reports monitored" value={summary.data.totalReports} />
          <Kpi label="Refresh failed" value={summary.data.refreshFailed} tone="bad" />
          <Kpi label="Slower than 15 s" value={summary.data.slowOver15s} tone="warn" />
          <Kpi label="Orphaned" value={summary.data.orphaned} tone="warn" />
          <Kpi label="Status unknown" value={summary.data.statusUnknown} />
        </section>
      )}
      <p className="muted small">Latest snapshot ({summary.data?.snapshot ?? "…"} of 20). Snapshots are an assumption: the CSV has no timestamps.</p>

      <section className="card">
        <div className="card-head">
          <h2>{role === "owner" ? "My reports" : "All reports"}</h2>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="SUCCESS">Success</option>
            <option value="FAILED">Failed</option>
            <option value="TIMED_OUT">Timed out</option>
            <option value="UNKNOWN">Unknown</option>
          </select>
        </div>
        {reports.loading && <p className="muted">Loading…</p>}
        {reports.error && <p className="error">{reports.error}</p>}
        {reports.data && (
          <table>
            <thead>
              <tr>
                <th>Report</th>
                {role !== "viewer" && <th>Owner</th>}
                <th>Refresh</th>
                <th className="num">Load time</th>
                <th className="num">Monthly views</th>
              </tr>
            </thead>
            <tbody>
              {reports.data.reports.map((r) => (
                <tr key={r.reportId}>
                  <td><span className="id">{r.reportId}</span> <span className="muted">{r.reportName}</span></td>
                  {role !== "viewer" && <td>{r.owner ?? <span className="pill warn">No owner</span>}</td>}
                  <td><span className={`pill ${STATUS_CLASS[r.status]}`}>{r.status}</span></td>
                  <td className={`num ${r.loadSec > 30 ? "text-bad" : r.loadSec > 15 ? "text-warn" : ""}`}>{r.loadSec.toFixed(1)} s</td>
                  <td className="num">{r.views.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function Kpi({ label, value, tone = "" }) {
  return (
    <div className={`card kpi ${tone}`}>
      <span className="kpi-value">{value}</span>
      <span className="muted">{label}</span>
    </div>
  );
}
