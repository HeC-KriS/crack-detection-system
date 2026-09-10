// pages/Dashboard.jsx — Live stats + recent alerts overview
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { inferencesAPI, statsAPI } from "../api/client";

function StatCard({ label, value, color, sub }) {
  return (
    <div style={{ ...card.root, borderTopColor: color }}>
      <div style={card.value}>{value ?? "—"}</div>
      <div style={card.label}>{label}</div>
      {sub && <div style={card.sub}>{sub}</div>}
    </div>
  );
}

const card = {
  root: {
    background: "#0d1321",
    border: "1px solid #1e2942",
    borderTop: "2px solid",
    borderRadius: 8,
    padding: "20px 22px",
    minWidth: 0,
  },
  value: { fontSize: 34, fontWeight: 700, color: "#e2e8f0", letterSpacing: "-0.02em", lineHeight: 1 },
  label: { fontSize: 10, color: "#4a5a7a", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 8 },
  sub: { fontSize: 11, color: "#3a4a6a", marginTop: 4 },
};

function CameraStatusDot({ status }) {
  const colors = { online: "#10b981", offline: "#ef4444", error: "#f59e0b", paused: "#6b7280" };
  return (
    <span style={{
      display: "inline-block",
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: colors[status] || "#6b7280",
      flexShrink: 0,
    }} />
  );
}

function RecentAlertRow({ item }) {
  const ts = new Date(item.captured_at).toLocaleString();
  return (
    <div style={row.root}>
      <div style={row.dot}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
          <polygon points="12 2 22 20 2 20"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </div>
      <div style={{ flex: 1 }}>
        <div style={row.title}>
          Camera {item.camera_id} — {item.num_detections} crack{item.num_detections !== 1 ? "s" : ""}
        </div>
        <div style={row.ts}>{ts}</div>
      </div>
      <div style={{ ...row.conf, color: item.max_confidence > 0.7 ? "#ef4444" : "#f59e0b" }}>
        {(item.max_confidence * 100).toFixed(0)}%
      </div>
      <span style={{ ...row.badge, ...(item.is_verified ? row.badgeVerified : row.badgePending) }}>
        {item.is_verified ? "Reviewed" : "Pending"}
      </span>
      <Link to={`/queue?highlight=${item.frame_id}`} style={row.link}>View →</Link>
    </div>
  );
}

const row = {
  root: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 0",
    borderBottom: "1px solid #111827",
  },
  dot: { flexShrink: 0 },
  title: { fontSize: 13, color: "#cbd5e1" },
  ts: { fontSize: 11, color: "#3a4a6a", marginTop: 2 },
  conf: { fontSize: 14, fontWeight: 700, letterSpacing: "0.02em", minWidth: 44, textAlign: "right" },
  badge: {
    fontSize: 10,
    padding: "3px 8px",
    borderRadius: 4,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    fontWeight: 600,
    flexShrink: 0,
  },
  badgePending: { background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)" },
  badgeVerified: { background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)" },
  link: { fontSize: 12, color: "#3b82f6", textDecoration: "none", flexShrink: 0 },
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const intervalRef = useRef(null);

  const fetchAll = async () => {
    try {
      const [s, r] = await Promise.all([
        statsAPI.dashboard(),
        inferencesAPI.list({ page: 1, page_size: 10, crack_only: true }),
      ]);
      setStats(s.data);
      setRecent(r.data.items || []);
    } catch (e) {
      console.error("Dashboard fetch failed", e);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    fetchAll();
    intervalRef.current = setInterval(fetchAll, 15000); // refresh every 15s
    return () => clearInterval(intervalRef.current);
  }, []);

  return (
    <div style={p.root}>
      {/* Page header */}
      <div style={p.header}>
        <div>
          <h1 style={p.pageTitle}>System Overview</h1>
          <div style={p.pageSubtitle}>Live monitoring dashboard · auto-refreshes every 15s</div>
        </div>
        <div style={p.liveIndicator}>
          <span style={p.liveDot} />
          LIVE
        </div>
      </div>

      {/* Stats grid */}
      {loadingStats ? (
        <div style={p.loading}>Loading stats…</div>
      ) : stats ? (
        <div style={p.statsGrid}>
          <StatCard label="Cracks Detected (24h)" value={stats.total_cracks_detected_24h} color="#ef4444" />
          <StatCard label="Pending Verification" value={stats.pending_verification} color="#f59e0b" sub="Requires officer review" />
          <StatCard label="True Positives" value={stats.true_positives_total} color="#10b981" />
          <StatCard label="False Positives" value={stats.false_positives_total} color="#6b7280" />
          <StatCard label="Need Inspection" value={stats.needs_inspection_total} color="#8b5cf6" />
          <StatCard
            label="Camera Status"
            value={`${stats.cameras_online}/${stats.cameras_online + stats.cameras_offline}`}
            color={stats.cameras_offline > 0 ? "#f59e0b" : "#10b981"}
            sub={`${stats.cameras_offline} offline`}
          />
        </div>
      ) : null}

      {/* Recent alerts */}
      <div style={p.section}>
        <div style={p.sectionHeader}>
          <span style={p.sectionTitle}>Recent Detections</span>
          <Link to="/queue" style={p.sectionLink}>View Pending →</Link>
        </div>
        <div style={p.tableWrap}>
          {recent.length === 0 ? (
            <div style={p.empty}>No detections recorded yet.</div>
          ) : (
            recent.map((item) => <RecentAlertRow key={item.id} item={item} />)
          )}
        </div>
      </div>
    </div>
  );
}

const p = {
  root: { padding: "32px 36px", fontFamily: "'DM Mono', monospace", maxWidth: 1200 },
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32 },
  pageTitle: { fontSize: 22, fontWeight: 700, color: "#e2e8f0", margin: 0, letterSpacing: "-0.01em" },
  pageSubtitle: { fontSize: 11, color: "#3a4a6a", marginTop: 6, letterSpacing: "0.05em" },
  liveIndicator: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    background: "rgba(16,185,129,0.1)",
    border: "1px solid rgba(16,185,129,0.25)",
    borderRadius: 6,
    padding: "6px 12px",
    fontSize: 10,
    color: "#10b981",
    letterSpacing: "0.12em",
    fontWeight: 700,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#10b981",
    display: "inline-block",
    animation: "pulse 2s infinite",
  },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, marginBottom: 36 },
  section: {
    background: "#0d1321",
    border: "1px solid #1e2942",
    borderRadius: 8,
    padding: "20px 22px",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 12, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700 },
  sectionLink: { fontSize: 12, color: "#3b82f6", textDecoration: "none" },
  tableWrap: {},
  loading: { color: "#3a4a6a", fontSize: 13 },
  empty: { color: "#3a4a6a", fontSize: 13, textAlign: "center", padding: 24 },
};
