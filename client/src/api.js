// One place for every call to our backend. It adds the token automatically.
export async function api(path, token, { method = "GET", body } = {}) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(`/api/v1${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Request failed (${res.status})`);
  return data;
}

export async function login(username, password) {
  return (await api("/auth/login", null, { method: "POST", body: { username, password } })).token;
}

// Read the role from inside the token (the middle part is base64 JSON).
// Only used to decide which tabs to SHOW; the server still enforces access.
export function readToken(token) {
  return JSON.parse(atob(token.split(".")[1]));
}
