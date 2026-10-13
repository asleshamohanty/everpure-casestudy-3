// API + RBAC tests. Run with the server already running: node test-rbac.js
const BASE = "http://localhost:4000/api/v1";

async function login(username, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return (await res.json()).token;
}

async function call(path, token, { method = "GET", body } = {}) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
}
const status = async (path, token, opts) => (await call(path, token, opts)).status;

function check(name, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  (got ${actual}, expected ${expected})`);
  if (!ok) process.exitCode = 1;
}

(async () => {
  const admin = await login("admin", "admin123");
  const owner = await login("owner", "owner123");
  const viewer = await login("viewer", "viewer123");

  // Who are you? (401) / Are you allowed? (403)
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

  // Fix-it queue
  check("admin sees fix-it queue", await status("/fixit", admin), 200);
  check("viewer blocked from fix-it queue", await status("/fixit", viewer), 403);
  const ownerQueue = (await call("/fixit", owner)).body.items;
  check("owner's fix-it queue holds only own reports", ownerQueue.every((it) => it.owner === "user_9@company.com"), true);

  // Field trimming: viewers never receive owner emails or costs
  const viewerReport = (await call("/reports", viewer)).body.reports[0];
  check("viewer gets no owner field", "owner" in viewerReport, false);
  check("viewer gets no cost field", "credits" in viewerReport, false);

  // Ownership reassignment (admin only, validated, audited, reflected in health)
  const orphan = (await call("/reports/orphans", admin)).body.reports[0].reportId;
  const before = (await call("/health/summary", admin)).body.orphaned;
  check("owner cannot reassign", await status(`/reports/${orphan}/owner`, owner, { method: "PATCH", body: { owner: "x@company.com" } }), 403);
  check("viewer cannot reassign", await status(`/reports/${orphan}/owner`, viewer, { method: "PATCH", body: { owner: "x@company.com" } }), 403);
  check("invalid email -> 400", await status(`/reports/${orphan}/owner`, admin, { method: "PATCH", body: { owner: "not-an-email" } }), 400);
  check("unknown report -> 404", await status("/reports/RPT_999/owner", admin, { method: "PATCH", body: { owner: "x@company.com" } }), 404);
  check("admin assigns owner", await status(`/reports/${orphan}/owner`, admin, { method: "PATCH", body: { owner: "user_9@company.com" } }), 200);
  check("orphan count drops by 1", (await call("/health/summary", admin)).body.orphaned, before - 1);
  check("new owner can now open it", await status(`/reports/${orphan}`, owner), 200);
  const audit = (await call("/ownership/audit", admin)).body.changes[0];
  check("change is audited", `${audit.reportId} by ${audit.by}`, `${orphan} by admin`);
  // Put it back so the test leaves no trace
  await call(`/reports/${orphan}/owner`, admin, { method: "PATCH", body: { owner: null } });
  check("unassign restores orphan count", (await call("/health/summary", admin)).body.orphaned, before);
})();
