// One place for every call to our backend. It adds the token automatically.
export async function api(path, token) {
  const res = await fetch(`/api/v1${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message || `Request failed (${res.status})`);
  return body;
}

export async function login(username, password) {
  const res = await fetch("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message || "Login failed");
  return body.token;
}

// Read the role from inside the token (the middle part is base64 JSON).
// Only used to decide which tabs to SHOW; the server still enforces access.
export function readToken(token) {
  return JSON.parse(atob(token.split(".")[1]));
}
