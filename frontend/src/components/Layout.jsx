// components/Layout.jsx — Sidebar + main content shell

import { Link, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

const NAV_ITEMS = [
  {
    to: "/dashboard",
    label: "Overview",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },

  {
    to: "/queue",
    label: "Verify Queue",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
      </svg>
    ),
    badge: true,
  },

  {
    to: "/history",
    label: "History",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },

  {
    to: "/pipeline-log",
    label: "Pipeline Log",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 12h18" />
        <path d="M6 8h12" />
        <path d="M6 16h12" />
        <circle cx="6" cy="12" r="2" />
        <circle cx="18" cy="12" r="2" />
      </svg>
    ),
  },

  {
    to: "/crack-log",
    label: "Crack Log",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2v20" />
        <path d="M2 12h20" />
        <path d="M5 5l14 14" />
        <path d="M19 5L5 19" />
      </svg>
    ),
  },

  {
    to: "/cameras",
    label: "Cameras",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M23 7l-7 5 7 5V7z" />
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      </svg>
    ),
  },
];

export default function Layout() {
  const [lightMode, setLightMode] = useState(
    localStorage.getItem("theme") === "light"
  );

  const { pathname } = useLocation();
  const { user, logout } = useAuth();

  // Keep the global CSS theme in sync
  useEffect(() => {
    document.documentElement.setAttribute(
      "data-theme",
      lightMode ? "light" : "dark"
    );
  }, [lightMode]);

  const toggleTheme = () => {
    const next = !lightMode;

    setLightMode(next);
    localStorage.setItem("theme", next ? "light" : "dark");
  };

  // Theme colors used directly by this component
  const theme = lightMode
    ? {
        rootBg: "#f1f2f0",
        sidebarBg: "#ffffff",
        panelBg: "#ffffff",
        text: "#24272b",
        secondary: "#4b5560",
        muted: "#78818b",
        border: "#dfe2df",
        borderStrong: "#cdd2ce",
        activeBg: "#e8eef3",
        activeText: "#2e4a63",
        icon: "#526173",
        avatarBg: "#edf3f7",
        avatarText: "#2e4a63",
      }
    : {
        rootBg: "#080c14",
        sidebarBg: "#0d1321",
        panelBg: "#0d1321",
        text: "#e2e8f0",
        secondary: "#94a3b8",
        muted: "#4a5a7a",
        border: "#1e2942",
        borderStrong: "#2a3a5c",
        activeBg: "#1a2940",
        activeText: "#93c5fd",
        icon: "#5a6a8a",
        avatarBg: "#1a3a5c",
        avatarText: "#60a5fa",
      };

  return (
    <div
      style={{
        ...styles.root,
        background: theme.rootBg,
        color: theme.text,
      }}
    >
      {/* ── Sidebar ─────────────────────────────────────────────── */}

      <aside
        style={{
          ...styles.sidebar,
          background: theme.sidebarBg,
          borderRightColor: theme.border,
        }}
      >
        {/* Brand */}

        <div
          style={{
            ...styles.brand,
            borderBottomColor: theme.border,
          }}
        >
          <div
            style={{
              ...styles.brandIcon,
              background: lightMode ? "#f3f5f3" : "#1a2235",
              borderColor: theme.borderStrong,
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2.5"
            >
              <polygon points="12 2 22 20 2 20" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>

          <div>
            <div
              style={{
                ...styles.brandName,
                color: theme.text,
              }}
            >
              CrackSentinel
            </div>

            <div
              style={{
                ...styles.brandSub,
                color: theme.muted,
              }}
            >
              v1.0 · AI Monitoring
            </div>
          </div>
        </div>

        {/* Navigation */}

        <nav style={styles.nav}>
          {NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.to);

            return (
              <Link
                key={item.to}
                to={item.to}
                style={{
                  ...styles.navItem,
                  color: active ? theme.activeText : theme.icon,
                  background: active ? theme.activeBg : "transparent",
                  borderLeft: active
                    ? "2px solid #3b82f6"
                    : "2px solid transparent",
                  paddingLeft: active ? 10 : 12,
                }}
              >
                <span
                  style={{
                    ...styles.navIcon,
                    opacity: active ? 1 : 0.6,
                    color: active ? "#60a5fa" : theme.icon,
                  }}
                >
                  {item.icon}
                </span>

                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Theme toggle */}

        <button
          onClick={toggleTheme}
          className="theme-toggle"
          title={
            lightMode
              ? "Switch to dark mode"
              : "Switch to light mode"
          }
          style={{
            ...styles.themeToggle,
            background: lightMode ? "#ffffff" : "#1a2940",
            color: lightMode ? "#344054" : "#b5c7dc",
            borderColor: lightMode ? "#d5d9de" : "#2a3a5c",
          }}
        >
          {lightMode ? "☾ Dark Mode" : "☀ Light Mode"}
        </button>

        {/* User footer */}

        <div
          style={{
            ...styles.sidebarFooter,
            borderTopColor: theme.border,
          }}
        >
          <div style={styles.userInfo}>
            <div
              style={{
                ...styles.userAvatar,
                background: theme.avatarBg,
                color: theme.avatarText,
                borderColor: theme.borderStrong,
              }}
            >
              {user?.username?.[0]?.toUpperCase()}
            </div>

            <div>
              <div
                style={{
                  ...styles.username,
                  color: theme.secondary,
                }}
              >
                {user?.username}
              </div>

              <div
                style={{
                  ...styles.userRole,
                  color: theme.muted,
                }}
              >
                {user?.role?.toUpperCase()}
              </div>
            </div>
          </div>

          <button
            onClick={logout}
            style={{
              ...styles.logoutBtn,
              borderColor: theme.border,
              color: theme.icon,
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────── */}

      <main
        style={{
          ...styles.main,
          background: theme.rootBg,
          color: theme.text,
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}

const styles = {
  root: {
    display: "flex",
    height: "100vh",
    width: "100%",
    fontFamily: "'DM Mono', 'Courier New', monospace",
    overflow: "hidden",
  },

  sidebar: {
    width: 216,
    display: "flex",
    flexDirection: "column",
    padding: 0,
    flexShrink: 0,
  },

  brand: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "24px 20px 20px",
  },

  brandIcon: {
    width: 40,
    height: 40,
    border: "1px solid",
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  brandName: {
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "'DM Mono', monospace",
    letterSpacing: "0.02em",
  },

  brandSub: {
    fontSize: 10,
    marginTop: 2,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  },

  nav: {
    padding: "16px 12px",
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },

  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 12px",
    borderRadius: 6,
    fontSize: 13,
    textDecoration: "none",
    transition: "all 0.15s",
    letterSpacing: "0.02em",
  },

  navIcon: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
  },

  themeToggle: {
    margin: "0 15px 16px",
    padding: "10px 12px",
    border: "1px solid",
    borderRadius: 6,
    fontFamily: "'DM Mono', monospace",
    fontSize: 12,
    textAlign: "left",
    transition: "all 0.15s",
  },

  sidebarFooter: {
    padding: "16px 20px",
    borderTop: "1px solid",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },

  userInfo: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },

  userAvatar: {
    width: 30,
    height: 30,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 700,
    border: "1px solid",
    flexShrink: 0,
  },

  username: {
    fontSize: 12,
    fontWeight: 500,
  },

  userRole: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },

  logoutBtn: {
    background: "none",
    border: "1px solid",
    borderRadius: 6,
    padding: "6px 8px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    transition: "all 0.15s",
    flexShrink: 0,
  },

  main: {
    flex: 1,
    overflow: "auto",
  },
};