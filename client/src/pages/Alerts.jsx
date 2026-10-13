const LABEL = { live: "Live", connecting: "Connecting…", reconnecting: "Reconnecting…", off: "Off" };

export default function Alerts({ alerts, status }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>Live alerts</h2>
        <span className="muted"><span className={`dot ${status}`} /> {LABEL[status]} · {alerts.length} received</span>
      </div>
      <p className="muted small">
        Pushed over WebSocket. Critical: load over 30 s or refresh FAILED/TIMED_OUT. Data quality: status UNKNOWN.
        A report alerts once when a problem starts, not on every snapshot while it continues.
      </p>
      {alerts.length === 0 && <p className="muted">Waiting for the next snapshot…</p>}
      <ul className="alerts">
        {alerts.map((a) => (
          <li key={a.id} className={`alert ${a.severity}`}>
            <span className={`pill ${a.severity === "critical" ? "bad" : "warn"}`}>{a.severity}</span>
            <span className="id">{a.reportId}</span>
            <span>{a.message}</span>
            <span className="muted small">snapshot {a.snapshot}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
