// components/Layout.jsx — Sidebar + main content shell
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV_ITEMS = [
  {
    to: "/dashboard",
    label: "Overview",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
    ),
  },
  {
    to: "/queue",
    label: "Verify Queue",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
      </svg>
    ),
    badge: true,
  },
  {
    to: "/history",
    label: "History",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
  },
  {
    to: "/cameras",
    label: "Cameras",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
      </svg>
    ),
  },
];

export default function Layout() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();

  return (
    <div style={styles.root}>
      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside style={styles.sidebar}>
        <div style={styles.brand}>
          <div style={styles.brandIcon}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5">
              <polygon points="12 2 22 20 2 20"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div>
            <div style={styles.brandName}>CrackSentinel</div>
            <div style={styles.brandSub}>v1.0 · AI Monitoring</div>
          </div>
        </div>

        <nav style={styles.nav}>
          {NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                style={{ ...styles.navItem, ...(active ? styles.navItemActive : {}) }}
              >
                <span style={{ ...styles.navIcon, ...(active ? styles.navIconActive : {}) }}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div style={styles.sidebarFooter}>
          <div style={styles.userInfo}>
            <div style={styles.userAvatar}>{user?.username?.[0]?.toUpperCase()}</div>
            <div>
              <div style={styles.username}>{user?.username}</div>
              <div style={styles.userRole}>Officer</div>
            </div>
          </div>
          <button onClick={logout} style={styles.logoutBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────── */}
      <main style={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}

const styles = {
  root: {
    display: "flex",
    height: "100vh",
    background: "#080c14",
    color: "#e2e8f0",
    fontFamily: "'DM Mono', 'Courier New', monospace",
    overflow: "hidden",
  },
  sidebar: {
    width: 240,
    background: "#0d1321",
    borderRight: "1px solid #1e2942",
    display: "flex",
    flexDirection: "column",
    padding: "0",
    flexShrink: 0,
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "24px 20px 20px",
    borderBottom: "1px solid #1e2942",
  },
  brandIcon: {
    width: 40,
    height: 40,
    background: "#1a2235",
    border: "1px solid #2a3a5c",
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: {
    fontSize: 14,
    fontWeight: 600,
    color: "#f1f5f9",
    fontFamily: "'DM Mono', monospace",
    letterSpacing: "0.02em",
  },
  brandSub: {
    fontSize: 10,
    color: "#4a5a7a",
    marginTop: 2,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  },
  nav: { padding: "16px 12px", flex: 1, display: "flex", flexDirection: "column", gap: 2 },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 12px",
    borderRadius: 6,
    fontSize: 13,
    color: "#5a6a8a",
    textDecoration: "none",
    transition: "all 0.15s",
    letterSpacing: "0.02em",
  },
  navItemActive: {
    background: "#1a2940",
    color: "#93c5fd",
    borderLeft: "2px solid #3b82f6",
    paddingLeft: 10,
  },
  navIcon: { opacity: 0.5, flexShrink: 0 },
  navIconActive: { opacity: 1, color: "#60a5fa" },
  sidebarFooter: {
    padding: "16px 20px",
    borderTop: "1px solid #1e2942",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  userInfo: { display: "flex", alignItems: "center", gap: 10 },
  userAvatar: {
    width: 30,
    height: 30,
    background: "#1a3a5c",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 700,
    color: "#60a5fa",
    border: "1px solid #2a4a7c",
  },
  username: { fontSize: 12, color: "#94a3b8", fontWeight: 500 },
  userRole: { fontSize: 10, color: "#3a4a6a", textTransform: "uppercase", letterSpacing: "0.08em" },
  logoutBtn: {
    background: "none",
    border: "1px solid #1e2942",
    borderRadius: 6,
    padding: "6px 8px",
    color: "#4a5a7a",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    transition: "all 0.15s",
  },
  main: {
    flex: 1,
    overflow: "auto",
    background: "#080c14",
  },
};
