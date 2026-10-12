const jwt = require("jsonwebtoken");

// In production this comes from a secret manager. Never hard-code a real secret.
const SECRET = process.env.JWT_SECRET || "dev-only-secret-change-me";

// Demo users for the case study. Real Everpure would use single sign-on instead.
const USERS = {
  admin:  { password: "admin123",  role: "admin" },
  owner:  { password: "owner123",  role: "owner", email: "user_9@company.com" },
  viewer: { password: "viewer123", role: "viewer" },
};

// Check username + password, return a signed token or null
function login(username, password) {
  const user = USERS[username];
  if (!user || user.password !== password) return null;
  return jwt.sign({ username, role: user.role, email: user.email || null }, SECRET, { expiresIn: "8h" });
}

// Middleware 1: WHO are you? No valid token -> 401
function authenticate(req, res, next) {
  const header = req.headers.authorization || "";      // "Bearer <token>"
  const token = header.replace("Bearer ", "");
  try {
    req.user = jwt.verify(token, SECRET);               // throws if fake or expired
    next();                                             // let the request continue
  } catch {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Log in first" } });
  }
}

// Middleware 2: are you ALLOWED? Wrong role -> 403
function requireRole(...allowed) {
  return (req, res, next) => {
    if (allowed.includes(req.user.role)) return next();
    res.status(403).json({ error: { code: "FORBIDDEN", message: `Role '${req.user.role}' cannot access this` } });
  };
}

module.exports = { login, authenticate, requireRole };