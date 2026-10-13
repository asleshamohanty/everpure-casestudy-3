// Run with the server already running in another terminal: node test-rbac.js
const BASE = "http://localhost:4000/api/v1";

async function login(username, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return (await res.json()).token;
}

async function status(path, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${BASE}${path}`, { headers });
  return res.status;
}

function check(name, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  (got ${actual}, expected ${expected})`);
  if (!ok) process.exitCode = 1;
}

(async () => {
  const admin = await login("admin", "admin123");
  const owner = await login("owner", "owner123");
  const viewer = await login("viewer", "viewer123");

  check("no token -> 401", await status("/health/summary"), 401);
  check("wrong password -> no token", await login("admin", "wrong"), undefined);
  check("viewer sees health", await status("/health/summary", viewer), 200);
  check("viewer blocked from costs", await status("/costs", viewer), 403);
  check("viewer blocked from orphans", await status("/reports/orphans", viewer), 403);
  check("owner sees costs", await status("/costs", owner), 200);
  check("owner blocked from orphans", await status("/reports/orphans", owner), 403);
  check("owner cannot open others' report", await status("/reports/RPT_200", owner), 404);
  check("admin sees orphans", await status("/reports/orphans", admin), 200);
  check("admin sees costs", await status("/costs", admin), 200);
  check("admin sees data quality", await status("/data-quality", admin), 200);
  check("viewer blocked from data quality", await status("/data-quality", viewer), 403);
})();