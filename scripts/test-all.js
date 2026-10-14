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
// Tests use their own temporary state file, so they never touch ownership changes made in the demo
const fs = require("fs");
const os = require("os");
const TEST_STATE = path.join(os.tmpdir(), `pic-test-ownership-${process.pid}.json`);
const cleanUp = () => { try { fs.rmSync(TEST_STATE, { force: true }); } catch { /* best effort */ } };
cleanUp();
const server = spawn("node", ["server/server.js"], {
  cwd: ROOT,
  env: { ...process.env, REPLAY_MS: "1000", STATE_FILE: TEST_STATE, PORT: "4000" },
});

server.stdout.on("data", (chunk) => {
  if (!chunk.toString().includes("running at")) return;
  server.stdout.removeAllListeners("data");

  console.log("\n### API + RBAC tests");
  failed = run("node", ["test-rbac.js"]) !== 0 || failed;
  console.log("\n### Real-time alert tests");
  failed = run("node", ["test-alerts.js"]) !== 0 || failed;
  server.kill();
  cleanUp();

  console.log("\n### SQL suite (DuckDB)");
  const hasDuckdb = spawnSync("python3", ["-c", "import duckdb"], { cwd: ROOT }).status === 0;
  if (hasDuckdb) {
    failed = run("python3", ["scripts/run_sql.py"]) !== 0 || failed;
  } else if (process.env.CI) {
    console.log("FAIL  DuckDB is required in CI");
    failed = true;
  } else {
    console.log("SKIPPED  Python package 'duckdb' not installed. Run: pip3 install duckdb");
  }

  console.log(failed ? "\nSOME CHECKS FAILED" : "\nALL CHECKS PASSED");
  process.exit(failed ? 1 : 0);
});
