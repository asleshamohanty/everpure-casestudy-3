// Connects to the live alert stream and prints alerts. Usage: node watch-alerts.js admin admin123
const WebSocket = require("ws");
const [username = "admin", password = "admin123"] = process.argv.slice(2);

(async () => {
  const res = await fetch("http://localhost:4000/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const { token } = await res.json();

  const socket = new WebSocket(`ws://localhost:4000/ws/alerts?token=${token}`);
  socket.on("message", (data) => {
    const msg = JSON.parse(data);
    if (msg.type === "hello") return console.log(`Connected as ${msg.role}. Waiting for alerts...`);
    console.log(`[${msg.severity.toUpperCase()}] ${msg.reportId} ${msg.rule}: ${msg.message}`);
  });
  socket.on("close", (code, reason) => console.log(`Closed: ${code} ${reason}`));
})();