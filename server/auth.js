const crypto = require("crypto");
const jwt = require("jsonwebtoken");

// The signing secret comes from the environment. A built-in fallback exists only for local
// development; in production (NODE_ENV=production) the server refuses to start without one.
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const SECRET = process.env.JWT_SECRET || (IS_PRODUCTION ? null : "dev-only-secret-change-me");
if (!SECRET) throw new Error("JWT_SECRET must be set when NODE_ENV=production");

// Demo users for the case study. Passwords are stored only as salted scrypt hashes, never
// as plain text. Real Everpure would use single sign-on (OIDC/SAML) instead.
const USERS = {
  admin:  { role: "admin",  salt: "a7d6273e9641ff78", hash: "70660bdb0e17daaf87fb0bc0cb3e4dfa7cc05e62f6e841df7876ab808aa2fcec" },
  owner:  { role: "owner",  salt: "f43adcb1c57b730b", hash: "320a84ff115346918c85f0b66f64582daae978740ead8393710dc95e9b82ff0f", email: "user_9@company.com" },
  viewer: { role: "viewer", salt: "f11e991d64a560d5", hash: "5663c1712a0dd5d0429bbc7a8d2ed562a461ee34155f7560d6c73854299ad504" },
};

function passwordMatches(user, password) {
  const given = crypto.scryptSync(String(password ?? ""), user.salt, 32);
  return crypto.timingSafeEqual(given, Buffer.from(user.hash, "hex")); // constant-time comparison
}

// Check username + password, return a signed token or null
function login(username, password) {
  const user = USERS[username];
  if (!user || !passwordMatches(user, password)) return null;
  return jwt.sign({ username, role: user.role, email: user.email || null }, SECRET, { expiresIn: "8h" });
}

// Returns the user inside a token, or null if the token is missing, fake or expired
function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

// Middleware 1: WHO are you? No valid token -> 401
function authenticate(req, res, next) {
  const header = req.headers.authorization || "";      // "Bearer <token>"
  const user = verifyToken(header.replace("Bearer ", ""));
  if (!user) return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Log in first" } });
  req.user = user;
  next();
}

// Middleware 2: are you ALLOWED? Wrong role -> 403
function requireRole(...allowed) {
  return (req, res, next) => {
    if (allowed.includes(req.user.role)) return next();
    res.status(403).json({ error: { code: "FORBIDDEN", message: `Role '${req.user.role}' cannot access this` } });
  };
}

module.exports = { login, authenticate, requireRole, verifyToken };
