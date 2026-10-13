import { useApi } from "../useApi";

const STATUS_CLASS = { SUCCESS: "ok", FAILED: "bad", TIMED_OUT: "bad", UNKNOWN: "warn" };
const MAX_SEC = 55; // longest load time in the data, so bars share one scale

// Side panel: one report's 20 snapshots, with a bar per load time
export default function ReportDetail({ id, token, role, onClose }) {
  const { data, error, loading } = useApi(`/reports/${id}`, token);
  const history = data?.history ?? [];
  const failed = history.filter((h) => h.flags.refreshFailed).length;
  const slow = history.filter((h) => h.loadSec > 15).length;

  return (
    <div className="overlay" onClick={onClose}>
      <aside className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          <div>
            <div className="eyebrow">Report history</div>
            <h2>{id} <span className="muted">{history[0]?.reportName}</span></h2>
          </div>
          <button className="link" onClick={onClose}>Close</button>
        </div>
        {loading && <p className="muted">Loading…</p>}
        {error && <p className="error">{error}</p>}
        {data && (
          <>
            <p className="small">
              Across {history.length} snapshots: <strong>{failed}</strong> failed refreshes,{" "}
              <strong>{slow}</strong> loads over 15 s.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Snap</th><th>Refresh</th><th>Load time</th>
                  {role !== "viewer" && <th>Owner seen in data</th>}
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.snapshot}>
                    <td className="num">{h.snapshot}</td>
                    <td><span className={`pill ${STATUS_CLASS[h.status]}`}>{h.status}</span></td>
                    <td>
                      <div className="bar-cell">
                        <div className={`bar ${h.loadSec > 30 ? "bad" : h.loadSec > 15 ? "warn" : "ok"}`}
                             style={{ width: `${(h.loadSec / MAX_SEC) * 100}%` }} />
                        <span className="num small">{h.loadSec.toFixed(1)} s</span>
                      </div>
                    </td>
                    {role !== "viewer" && <td className="muted small">{h.observedOwner ?? "none"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </aside>
    </div>
  );
}
