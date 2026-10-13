const { WebSocketServer } = require("ws");
const { verifyToken } = require("./auth");

// Attach a WebSocket server to the same HTTP server as Express, on path /ws/alerts
function createAlertSocket(httpServer, { currentOwner }) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/alerts" });

  wss.on("connection", (socket, req) => {
    // Browsers can't set headers on WebSockets, so the token comes in the URL: /ws/alerts?token=...
    const token = new URL(req.url, "http://localhost").searchParams.get("token");
    const user = verifyToken(token);
    if (!user) return socket.close(4401, "Log in first");               // like HTTP 401
    if (user.role === "viewer") return socket.close(4403, "Viewers do not receive alerts"); // like 403

    socket.user = user;
    socket.send(JSON.stringify({ type: "hello", role: user.role }));
  });

  // Heartbeat: ping every 30 s so dead connections get noticed and cleaned up
  setInterval(() => {
    for (const socket of wss.clients) socket.ping();
  }, 30000);

  // Send an alert to everyone allowed to see it
  function broadcast(alert) {
    for (const socket of wss.clients) {
      if (socket.readyState !== socket.OPEN) continue;
      const u = socket.user;
      const allowed = u.role === "admin" || (u.role === "owner" && currentOwner[alert.reportId] === u.email);
      if (allowed) socket.send(JSON.stringify(alert));
    }
  }

  return { broadcast };
}

module.exports = { createAlertSocket };