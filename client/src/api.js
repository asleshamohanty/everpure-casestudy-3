// One place for every call to our backend. It adds the token automatically.
export async function api(path, token, { method = "GET", body } = {}) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  if (body) headers["Content-Type"] = "application/json";

  let res;
  try {
    res = await fetch(`/api/v1${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error("Cannot reach the API server. Is it running (npm start)?");
  }

  // Read as text first: a server that is down, outdated or misconfigured may answer with an
  // HTML page instead of JSON, and we want a clear message rather than a parse error.
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      res.status === 404
        ? `The API server does not know ${path} (404). It may be running older code: restart it with npm start.`
        : `The API server sent an unexpected response (${res.status}).`
    );
  }
  if (res.status === 401 && token) {
    // Session expired or invalid: tell the app to log out instead of showing a broken page
    window.dispatchEvent(new Event("session-expired"));
  }
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

// Keep the session across a page refresh, but only in this browser tab (sessionStorage is
// cleared when the tab closes). Trade-off: any script on the page could read it; in production
// single sign-on with an httpOnly cookie avoids that. Expired tokens are ignored.
const KEY = "pic.session";
export function loadSession() {
  try {
    const token = sessionStorage.getItem(KEY);
    if (!token || readToken(token).exp * 1000 <= Date.now()) return null;
    return token;
  } catch {
    return null;
  }
}
export function saveSession(token) {
  try {
    if (token) sessionStorage.setItem(KEY, token);
    else sessionStorage.removeItem(KEY);
  } catch { /* storage unavailable: session simply won't survive a refresh */ }
}
