const LABEL = { live: "Live", connecting: "Connecting…", reconnecting: "Reconnecting…", polling: "Auto-refresh", off: "Off" };

export default function Alerts({ alerts, status }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>Live alerts</h2>
        <span className="muted"><span className={`dot ${status}`} /> {LABEL[status]} · {alerts.length} received</span>
      </div>
      <p className="muted small">
        Pushed over WebSocket. Warning: load over 15 s. Critical: load over 30 s, or refresh FAILED/TIMED_OUT. Data quality: status UNKNOWN.
        A report alerts once when a problem starts, not on every snapshot while it continues.
      </p>
      {alerts.length === 0 && <p className="muted">Waiting for the next snapshot…</p>}
      <ul className="alerts">
        {alerts.map((a) => (
          <li key={a.id} className={`alert ${a.severity}`}>
            <span className={`pill ${a.severity === "critical" ? "bad" : a.severity === "warning" ? "warn" : "dq"}`}>{a.severity}</span>
            <span className="id">{a.reportId}</span>
            <span>{a.message}</span>
            <span className="muted small">snapshot {a.snapshot}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
