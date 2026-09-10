// pages/Login.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(form.username, form.password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.detail || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.root}>
      {/* Grid overlay */}
      <div style={styles.grid} />
      
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logoArea}>
          <div style={styles.logoIcon}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
              <polygon points="12 2 22 20 2 20"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <h1 style={styles.title}>CrackSentinel</h1>
          <p style={styles.subtitle}>STRUCTURAL MONITORING SYSTEM</p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>USERNAME</label>
            <input
              style={styles.input}
              type="text"
              autoComplete="username"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              placeholder="Enter username"
              required
            />
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>PASSWORD</label>
            <input
              style={styles.input}
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Enter password"
              required
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button
            type="submit"
            disabled={loading}
            style={{ ...styles.submitBtn, ...(loading ? styles.submitBtnDisabled : {}) }}
          >
            {loading ? "AUTHENTICATING…" : "ACCESS SYSTEM"}
          </button>
        </form>

        <p style={styles.hint}>Authorized personnel only. All access is logged.</p>
      </div>
    </div>
  );
}

const styles = {
  root: {
    minHeight: "100vh",
    background: "#080c14",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    fontFamily: "'DM Mono', 'Courier New', monospace",
  },
  grid: {
    position: "absolute",
    inset: 0,
    backgroundImage: `
      linear-gradient(rgba(30,41,66,0.4) 1px, transparent 1px),
      linear-gradient(90deg, rgba(30,41,66,0.4) 1px, transparent 1px)
    `,
    backgroundSize: "40px 40px",
    pointerEvents: "none",
  },
  card: {
    background: "#0d1321",
    border: "1px solid #1e2942",
    borderRadius: 12,
    padding: "48px 40px",
    width: "100%",
    maxWidth: 400,
    position: "relative",
    boxShadow: "0 0 60px rgba(59,130,246,0.07)",
  },
  logoArea: { textAlign: "center", marginBottom: 36 },
  logoIcon: {
    width: 64,
    height: 64,
    background: "#0a0e17",
    border: "1px solid #2a3a5c",
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 16px",
    boxShadow: "0 0 20px rgba(245,158,11,0.1)",
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: "#e2e8f0",
    margin: "0 0 6px",
    letterSpacing: "0.05em",
  },
  subtitle: {
    fontSize: 10,
    color: "#3a4a6a",
    letterSpacing: "0.15em",
    margin: 0,
  },
  form: { display: "flex", flexDirection: "column", gap: 20 },
  fieldGroup: { display: "flex", flexDirection: "column", gap: 6 },
  label: {
    fontSize: 10,
    color: "#4a5a7a",
    letterSpacing: "0.12em",
    fontWeight: 600,
  },
  input: {
    background: "#080c14",
    border: "1px solid #1e2942",
    borderRadius: 6,
    padding: "12px 14px",
    fontSize: 13,
    color: "#e2e8f0",
    outline: "none",
    fontFamily: "inherit",
    transition: "border-color 0.15s",
  },
  error: {
    background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: 6,
    padding: "10px 14px",
    fontSize: 12,
    color: "#fca5a5",
  },
  submitBtn: {
    background: "#1d4ed8",
    border: "none",
    borderRadius: 6,
    padding: "14px",
    fontSize: 12,
    fontWeight: 700,
    color: "#fff",
    cursor: "pointer",
    letterSpacing: "0.1em",
    fontFamily: "inherit",
    transition: "all 0.15s",
    marginTop: 4,
  },
  submitBtnDisabled: {
    background: "#1a2942",
    color: "#4a5a7a",
    cursor: "not-allowed",
  },
  hint: {
    fontSize: 10,
    color: "#2a3a5a",
    textAlign: "center",
    marginTop: 20,
    marginBottom: 0,
    letterSpacing: "0.05em",
  },
};
