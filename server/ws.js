const { WebSocketServer } = require("ws");
const { verifyToken } = require("./auth");

// Attach a WebSocket server to the same HTTP server as Express, on path /ws/alerts
function createAlertSocket(httpServer, { owners }) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/alerts" });

  wss.on("connection", (socket, req) => {
    // Browsers can't set headers on WebSockets, so the token comes in the URL: /ws/alerts?token=...
    const token = new URL(req.url, "http://localhost").searchParams.get("token");
    const user = verifyToken(token);
    if (!user) return socket.close(4401, "Log in first");                                 // like HTTP 401
    if (user.role === "viewer") return socket.close(4403, "Viewers do not receive alerts"); // like 403

    socket.user = user;
    socket.send(JSON.stringify({ type: "hello", role: user.role }));
  });

  // Heartbeat: ping every 30 s so dead connections get noticed and cleaned up
  setInterval(() => {
    for (const socket of wss.clients) socket.ping();
  }, 30000);

  const open = () => [...wss.clients].filter((s) => s.readyState === s.OPEN && s.user);

  // Alerts go only to people allowed to see that report (owners = live ownership registry)
  function broadcastAlert(alert) {
    for (const socket of open()) {
      const u = socket.user;
      const allowed = u.role === "admin" || (u.role === "owner" && owners[alert.reportId] === u.email);
      if (allowed) socket.send(JSON.stringify(alert));
    }
  }

  // Events with no sensitive detail (a new snapshot arrived, ownership changed) go to everyone connected
  function broadcastEvent(event) {
    for (const socket of open()) socket.send(JSON.stringify(event));
  }

  return { broadcastAlert, broadcastEvent };
}

module.exports = { createAlertSocket };
