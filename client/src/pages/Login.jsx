import { useState } from "react";
import { login } from "../api";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault(); // stop the browser reloading the page
    setError(null);
    try {
      onLogin(await login(username, password));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login" onSubmit={submit}>
        <div className="eyebrow">Internal tool · Platform operations</div>
        <h1>Pure Insights Command Center</h1>
        <p className="muted">Sign in to monitor report health and cost.</p>
        <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit">Sign in</button>
        <p className="muted small">Demo users: admin / admin123 · owner / owner123 · viewer / viewer123</p>
      </form>
    </div>
  );
}
