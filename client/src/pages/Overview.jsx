import { useEffect, useState } from "react";
import { useApi } from "../useApi";
import ReportDetail from "./ReportDetail.jsx";

const STATUS_CLASS = { SUCCESS: "ok", FAILED: "bad", TIMED_OUT: "bad", UNKNOWN: "warn" };

export default function Overview({ token, role, tick }) {
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState(null);
  const summary = useApi("/health/summary", token, tick);
  const reports = useApi(`/reports${status ? `?status=${status}` : ""}`, token, tick);
  const s = summary.data;

  return (
    <>
      {summary.error && <p className="error">{summary.error}</p>}
      {s && (
        <section className="kpis">
          <Kpi label="Reports monitored" value={s.totalReports} />
          <Kpi label="Refresh failed" value={s.refreshFailed} tone="bad" />
          <Kpi label="Slower than 15 s" value={s.slowOver15s} tone="warn" note={`${s.criticalOver30s} over 30 s`} />
          <Kpi label="Orphaned" value={s.orphaned} tone="warn" />
          <Kpi label="Status unknown" value={s.statusUnknown} />
        </section>
      )}
      {s && <LiveLine snapshot={s.snapshot} total={s.totalSnapshots} updatedAt={s.updatedAt} />}

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
        <p className="muted small">Click a report to see its history.</p>
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
                <th className="num">Peak users</th>
                <th className="num">Queries (30 d)</th>
              </tr>
            </thead>
            <tbody>
              {reports.data.reports.map((r) => (
                <tr key={r.reportId} className="clickable" onClick={() => setSelected(r.reportId)}>
                  <td><span className="id">{r.reportId}</span> <span className="muted">{r.reportName}</span></td>
                  {role !== "viewer" && <td>{r.owner ?? <span className="pill warn">No owner</span>}</td>}
                  <td><span className={`pill ${STATUS_CLASS[r.status]}`}>{r.status}</span></td>
                  <td className={`num ${r.loadSec > 30 ? "text-bad" : r.loadSec > 15 ? "text-warn" : ""}`}>{r.loadSec.toFixed(1)} s</td>
                  <td className="num">{r.views.toLocaleString()}</td>
                  <td className="num">{r.peakUsers.toLocaleString()}</td>
                  <td className="num">{r.queries.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {selected && <ReportDetail id={selected} token={token} role={role} onClose={() => setSelected(null)} />}
    </>
  );
}

// "Snapshot 7 of 20 · updated 2 s ago", ticking every second
function LiveLine({ snapshot, total, updatedAt }) {
  const [, setNow] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNow((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const ago = Math.max(0, Math.round((Date.now() - Date.parse(updatedAt)) / 1000));
  return (
    <p className="muted small">
      Telemetry snapshot <strong>{snapshot}</strong> of {total} · updated {ago} s ago.
      Snapshots are replayed every few seconds because the CSV has no timestamps.
    </p>
  );
}

function Kpi({ label, value, tone = "", note }) {
  return (
    <div className={`card kpi ${tone}`}>
      <span className="kpi-value">{value}</span>
      <span className="muted">{label}</span>
      {note && <span className="muted small">{note}</span>}
    </div>
  );
}
