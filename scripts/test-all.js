// One command for every check: `npm test`
// Starts the server, runs the API and alert tests against it, stops the server,
// then runs the SQL suite. Exits non-zero if anything fails (CI relies on that).
const { spawn, spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const run = (cmd, args) => spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit" }).status;

console.log("\n### Data cleaning");
let failed = run("node", ["clean.js"]) !== 0;

console.log("\n### Fix-it queue validation");
failed = run("node", ["scripts/validate-fixit.js"]) !== 0 || failed;

console.log("\n### Owner-suggestion backtest (informational)");
run("node", ["scripts/backtest-owner.js"]);

console.log("\n### Starting server");
const server = spawn("node", ["server/server.js"], {
  cwd: ROOT,
  env: { ...process.env, REPLAY_MS: "1000" }, // faster replay so the alert test sees several snapshots
});

server.stdout.on("data", (chunk) => {
  if (!chunk.toString().includes("running at")) return;
  server.stdout.removeAllListeners("data");

  console.log("\n### API + RBAC tests");
  failed = run("node", ["test-rbac.js"]) !== 0 || failed;
  console.log("\n### Real-time alert tests");
  failed = run("node", ["test-alerts.js"]) !== 0 || failed;
  server.kill();

  console.log("\n### SQL suite (DuckDB)");
  failed = run("python3", ["scripts/run_sql.py"]) !== 0 || failed;

  console.log(failed ? "\nSOME CHECKS FAILED" : "\nALL CHECKS PASSED");
  process.exit(failed ? 1 : 0);
});
