import { useEffect, useState } from "react";
import { readToken, loadSession, saveSession } from "./api";
import { useLive } from "./useLive";
import Login from "./pages/Login.jsx";
import Overview from "./pages/Overview.jsx";
import Orphans from "./pages/Orphans.jsx";
import Costs from "./pages/Costs.jsx";
import Alerts from "./pages/Alerts.jsx";
import DataQuality from "./pages/DataQuality.jsx";
import Fixit from "./pages/Fixit.jsx";

// Which tabs each role can see. Hiding tabs is for convenience only:
// the server returns 403 if someone calls the API directly.
const TABS = [
  { id: "overview", label: "Overview", roles: ["admin", "owner", "viewer"] },
  { id: "alerts", label: "Live alerts", roles: ["admin", "owner"] },
  { id: "fixit", label: "Fix-it queue", roles: ["admin", "owner"] },
  { id: "orphans", label: "Orphaned reports", roles: ["admin"] },
  { id: "costs", label: "Costs", roles: ["admin", "owner"] },
  { id: "quality", label: "Data quality", roles: ["admin"] },
];

const STATUS_LABEL = { live: "Live", connecting: "Connecting…", reconnecting: "Reconnecting…", polling: "Auto-refresh", off: "Off" };

export default function App() {
  const [token, setTokenState] = useState(loadSession);
  const [tab, setTab] = useState("overview");
  const [notice, setNotice] = useState(null);
  const setToken = (t) => {
    saveSession(t);
    setTokenState(t);
  };

  // Log out automatically when the server says the session is no longer valid,
  // or when the token's 8-hour lifetime runs out while the page is open
  useEffect(() => {
    const expire = () => { setToken(null); setTab("overview"); setNotice("Your session expired. Please sign in again."); };
    window.addEventListener("session-expired", expire);
    let timer;
    if (token) timer = setTimeout(expire, Math.max(0, readToken(token).exp * 1000 - Date.now()));
    return () => { window.removeEventListener("session-expired", expire); clearTimeout(timer); };
  }, [token]);
  const user = token ? readToken(token) : null;
  const canConnect = Boolean(user && user.role !== "viewer");
  const { alerts, status, tick, clock } = useLive(token, canConnect);

  if (!token) return <Login onLogin={(t) => { setNotice(null); setToken(t); }} notice={notice} />;

  const visibleTabs = TABS.filter((t) => t.roles.includes(user.role));
  const critical = alerts.filter((a) => a.severity === "critical").length;

  return (
    <>
      {/* Dark utility strip, like the top bar on Everpure's own site */}
      <div className="utility">
        <div className="inner utility-row">
          <span>Internal tool · Platform operations</span>
          <span className="who">
            <span className="live-pill" title="Connection status">
              <span className={`dot ${status}`} /> {STATUS_LABEL[status]}
            </span>
            <span>{user.username}</span>
            <span className="role">{user.role}</span>
            <button className="link" onClick={() => { setToken(null); setTab("overview"); }}>Log out</button>
          </span>
        </div>
      </div>

      <header className="masthead">
        <div className="inner">
          <h1>Pure Insights Command Center</h1>
          <p className="lede">Report health, ownership, cost and live alerts for the analytics portal.</p>
          <nav className="tabs">
            {visibleTabs.map((t) => (
              <button key={t.id} className={tab === t.id ? "tab active" : "tab"} onClick={() => setTab(t.id)}>
                {t.label}
                {t.id === "alerts" && critical > 0 && <span className="badge">{critical}</span>}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="inner page">
        {tab === "overview" && <Overview token={token} role={user.role} tick={tick} clock={clock} />}
        {tab === "alerts" && <Alerts alerts={alerts} status={status} />}
        {tab === "fixit" && <Fixit token={token} tick={tick} />}
        {tab === "orphans" && <Orphans token={token} tick={tick} />}
        {tab === "costs" && <Costs token={token} tick={tick} />}
        {tab === "quality" && <DataQuality token={token} />}
      </main>
    </>
  );
}
