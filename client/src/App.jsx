import { useState } from "react";
import { readToken } from "./api";
import { useLive } from "./useLive";
import Login from "./pages/Login.jsx";
import Overview from "./pages/Overview.jsx";
import Orphans from "./pages/Orphans.jsx";
import Costs from "./pages/Costs.jsx";
import Alerts from "./pages/Alerts.jsx";
import DataQuality from "./pages/DataQuality.jsx";

// Which tabs each role can see. Hiding tabs is for convenience only:
// the server returns 403 if someone calls the API directly.
const TABS = [
  { id: "overview", label: "Overview", roles: ["admin", "owner", "viewer"] },
  { id: "alerts", label: "Live alerts", roles: ["admin", "owner"] },
  { id: "orphans", label: "Orphaned reports", roles: ["admin"] },
  { id: "costs", label: "Costs", roles: ["admin", "owner"] },
  { id: "quality", label: "Data quality", roles: ["admin"] },
];

const STATUS_LABEL = { live: "Live", connecting: "Connecting…", reconnecting: "Reconnecting…", polling: "Auto-refresh", off: "Off" };

export default function App() {
  const [token, setToken] = useState(null);
  const [tab, setTab] = useState("overview");
  const user = token ? readToken(token) : null;
  const canConnect = Boolean(user && user.role !== "viewer");
  const { alerts, status, tick, clock } = useLive(token, canConnect);

  if (!token) return <Login onLogin={setToken} />;

  const visibleTabs = TABS.filter((t) => t.roles.includes(user.role));
  const critical = alerts.filter((a) => a.severity === "critical").length;

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <div className="eyebrow">Platform operations</div>
          <h1>Pure Insights Command Center</h1>
          <p className="muted">Report health, ownership, cost and live alerts</p>
        </div>
        <div className="who">
          <span className="live-pill" title="Connection status">
            <span className={`dot ${status}`} /> {STATUS_LABEL[status]}
          </span>
          <span>{user.username}</span>
          <span className="role">{user.role}</span>
          <button className="link" onClick={() => { setToken(null); setTab("overview"); }}>Log out</button>
        </div>
      </header>

      <nav className="tabs">
        {visibleTabs.map((t) => (
          <button key={t.id} className={tab === t.id ? "tab active" : "tab"} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === "alerts" && critical > 0 && <span className="badge">{critical}</span>}
          </button>
        ))}
      </nav>

      <main>
        {tab === "overview" && <Overview token={token} role={user.role} tick={tick} clock={clock} />}
        {tab === "alerts" && <Alerts alerts={alerts} status={status} />}
        {tab === "orphans" && <Orphans token={token} tick={tick} />}
        {tab === "costs" && <Costs token={token} tick={tick} />}
        {tab === "quality" && <DataQuality token={token} />}
      </main>
    </div>
  );
}
