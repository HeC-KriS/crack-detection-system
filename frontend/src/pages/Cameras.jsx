// pages/Cameras.jsx — Camera management (list, add, edit, restart)
import { useEffect, useState } from "react";
import { camerasAPI } from "../api/client";

const STATUS_STYLE = {
  online: { color: "#10b981", dot: "#10b981", label: "ONLINE" },
  offline: { color: "#ef4444", dot: "#ef4444", label: "OFFLINE" },
  error: { color: "#f59e0b", dot: "#f59e0b", label: "ERROR" },
  paused: { color: "#6b7280", dot: "#6b7280", label: "PAUSED" },
};

const BLANK_FORM = {
  name: "",
  stream_url: "",
  frame_interval_seconds: "",
  alert_threshold: "",
  is_active: true,
};

export default function Cameras() {
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editCam, setEditCam] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [restartingId, setRestartingId] = useState(null);

  const fetchCameras = async () => {
    try {
      const { data } = await camerasAPI.list();
      setCameras(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCameras(); }, []);

  const openAdd = () => {
    setEditCam(null);
    setForm(BLANK_FORM);
    setFormError("");
    setShowForm(true);
  };

  const openEdit = (cam) => {
    setEditCam(cam);
    setForm({
      name: cam.name,
      stream_url: cam.stream_url,
      frame_interval_seconds: cam.frame_interval_seconds ?? "",
      alert_threshold: cam.alert_threshold ?? "",
      is_active: cam.is_active,
    });
    setFormError("");
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError("");
    const payload = {
      ...form,
      frame_interval_seconds: form.frame_interval_seconds ? parseInt(form.frame_interval_seconds) : null,
      alert_threshold: form.alert_threshold ? parseFloat(form.alert_threshold) : null,
    };
    try {
      if (editCam) {
        await camerasAPI.update(editCam.id, payload);
      } else {
        await camerasAPI.create(payload);
      }
      setShowForm(false);
      await fetchCameras();
    } catch (err) {
      setFormError(err.response?.data?.detail || "Save failed.");
    } finally {
      setFormLoading(false);
    }
  };

  const handleRestart = async (id) => {
    setRestartingId(id);
    try {
      await camerasAPI.restart(id);
      await fetchCameras();
    } finally {
      setRestartingId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this camera? All inference records will also be deleted.")) return;
    await camerasAPI.delete(id);
    await fetchCameras();
  };

  return (
    <div style={p.root}>
      <div style={p.header}>
        <div>
          <h1 style={p.title}>Camera Management</h1>
          <div style={p.sub}>{cameras.length} registered camera{cameras.length !== 1 ? "s" : ""}</div>
        </div>
        <button onClick={openAdd} style={p.addBtn}>+ Add Camera</button>
      </div>

      {loading ? (
        <div style={p.loading}>Loading cameras…</div>
      ) : cameras.length === 0 ? (
        <div style={p.empty}>
          <p style={{ color: "#3a4a6a", fontSize: 13 }}>
            No cameras registered. Add one to begin monitoring.
          </p>
        </div>
      ) : (
        <div style={p.grid}>
          {cameras.map((cam) => {
            const st = STATUS_STYLE[cam.status] || STATUS_STYLE.offline;
            return (
              <div key={cam.id} style={camCard.root}>
                <div style={camCard.topRow}>
                  <div>
                    <div style={camCard.name}>{cam.name}</div>
                    <div style={camCard.id}>ID #{cam.id}</div>
                  </div>
                  <div style={{ ...camCard.statusBadge, color: st.color, background: `${st.dot}18` }}>
                    <span style={{ ...camCard.statusDot, background: st.dot }} />
                    {st.label}
                  </div>
                </div>

                <div style={camCard.urlWrap}>
                  <span style={camCard.urlLabel}>STREAM URL</span>
                  <span style={camCard.url} title={cam.stream_url}>
                    {cam.stream_url.length > 50 ? cam.stream_url.slice(0, 50) + "…" : cam.stream_url}
                  </span>
                </div>

                <div style={camCard.paramRow}>
                  <Param label="Interval" value={cam.frame_interval_seconds ? `${cam.frame_interval_seconds}s` : "default"} />
                  <Param label="Threshold" value={cam.alert_threshold != null ? `${(cam.alert_threshold * 100).toFixed(0)}%` : "default"} />
                  <Param label="Active" value={cam.is_active ? "Yes" : "No"} />
                  <Param label="Last Seen" value={cam.last_seen_at ? new Date(cam.last_seen_at).toLocaleTimeString() : "Never"} />
                </div>

                <div style={camCard.actions}>
                  <button
                    onClick={() => handleRestart(cam.id)}
                    disabled={restartingId === cam.id}
                    style={camCard.btn}
                  >
                    {restartingId === cam.id ? "Restarting…" : "Restart"}
                  </button>
                  <button onClick={() => openEdit(cam)} style={camCard.btn}>Edit</button>
                  <button
                    onClick={() => handleDelete(cam.id)}
                    style={{ ...camCard.btn, color: "#ef4444", borderColor: "rgba(239,68,68,0.3)" }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit modal */}
      {showForm && (
        <div style={modal.overlay} onClick={() => setShowForm(false)}>
          <div style={modal.box} onClick={(e) => e.stopPropagation()}>
            <div style={modal.header}>
              <span style={modal.title}>{editCam ? "Edit Camera" : "Add Camera"}</span>
              <button onClick={() => setShowForm(false)} style={modal.close}>✕</button>
            </div>
            <form onSubmit={handleSubmit} style={modal.form}>
              <Field label="Name *" type="text" value={form.name}
                onChange={(v) => setForm((f) => ({ ...f, name: v }))} required />
              <Field label="Stream URL (RTSP / HTTP) *" type="text" value={form.stream_url}
                placeholder="rtsp://192.168.1.100/stream or http://..."
                onChange={(v) => setForm((f) => ({ ...f, stream_url: v }))} required />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label="Frame Interval (s)" type="number" value={form.frame_interval_seconds}
                  placeholder="5"
                  onChange={(v) => setForm((f) => ({ ...f, frame_interval_seconds: v }))} />
                <Field label="Alert Threshold (0–1)" type="number" value={form.alert_threshold}
                  placeholder="0.45" step="0.05" min="0" max="1"
                  onChange={(v) => setForm((f) => ({ ...f, alert_threshold: v }))} />
              </div>
              <label style={modal.checkLabel}>
                <input type="checkbox" checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
                <span style={{ marginLeft: 8, fontSize: 12, color: "#94a3b8" }}>Active (start capturing immediately)</span>
              </label>

              {formError && <div style={modal.error}>{formError}</div>}

              <div style={modal.btnRow}>
                <button type="button" onClick={() => setShowForm(false)} style={modal.cancelBtn}>Cancel</button>
                <button type="submit" disabled={formLoading} style={modal.saveBtn}>
                  {formLoading ? "Saving…" : editCam ? "Save Changes" : "Add Camera"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Param({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: "#2a3a5a", letterSpacing: "0.1em", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color: "#6b7280" }}>{value}</div>
    </div>
  );
}

function Field({ label, onChange, ...rest }) {
  return (
    <div>
      <label style={{ fontSize: 9, color: "#4a5a7a", letterSpacing: "0.1em", display: "block", marginBottom: 5 }}>
        {label}
      </label>
      <input
        {...rest}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          background: "#080c14",
          border: "1px solid #1e2942",
          borderRadius: 6,
          padding: "9px 12px",
          fontSize: 12,
          color: "#e2e8f0",
          fontFamily: "'DM Mono', monospace",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}

const camCard = {
  root: {
    background: "#0d1321",
    border: "1px solid #1e2942",
    borderRadius: 8,
    padding: "18px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  name: { fontSize: 16, fontWeight: 700, color: "#e2e8f0" },
  id: { fontSize: 10, color: "#3a4a6a", marginTop: 3 },
  statusBadge: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.1em",
    padding: "4px 8px",
    borderRadius: 4,
    flexShrink: 0,
  },
  statusDot: { width: 6, height: 6, borderRadius: "50%", flexShrink: 0 },
  urlWrap: {},
  urlLabel: { fontSize: 9, color: "#2a3a5a", letterSpacing: "0.1em", display: "block", marginBottom: 3 },
  url: { fontSize: 11, color: "#4a5a7a", wordBreak: "break-all" },
  paramRow: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 },
  actions: { display: "flex", gap: 8, marginTop: 4 },
  btn: {
    background: "#080c14",
    border: "1px solid #1e2942",
    borderRadius: 5,
    padding: "7px 14px",
    fontSize: 11,
    color: "#94a3b8",
    cursor: "pointer",
    fontFamily: "'DM Mono', monospace",
  },
};

const modal = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    backdropFilter: "blur(4px)",
    fontFamily: "'DM Mono', monospace",
  },
  box: {
    background: "#0d1321",
    border: "1px solid #1e2942",
    borderRadius: 10,
    width: "100%",
    maxWidth: 500,
    boxShadow: "0 0 60px rgba(0,0,0,0.5)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "18px 22px 14px",
    borderBottom: "1px solid #1e2942",
  },
  title: { fontSize: 15, fontWeight: 700, color: "#e2e8f0" },
  close: {
    background: "none",
    border: "1px solid #1e2942",
    borderRadius: 4,
    color: "#4a5a7a",
    cursor: "pointer",
    padding: "3px 9px",
    fontSize: 13,
  },
  form: { padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 },
  checkLabel: { display: "flex", alignItems: "center", fontSize: 12 },
  error: {
    padding: "9px 12px",
    background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: 6,
    fontSize: 11,
    color: "#fca5a5",
  },
  btnRow: { display: "flex", justifyContent: "flex-end", gap: 10 },
  cancelBtn: {
    background: "none",
    border: "1px solid #1e2942",
    borderRadius: 6,
    padding: "9px 18px",
    fontSize: 11,
    color: "#4a5a7a",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  saveBtn: {
    background: "#1d4ed8",
    border: "none",
    borderRadius: 6,
    padding: "9px 22px",
    fontSize: 11,
    fontWeight: 700,
    color: "#fff",
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: "0.06em",
  },
};

const p = {
  root: { padding: "32px 36px", fontFamily: "'DM Mono', monospace" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 },
  title: { fontSize: 22, fontWeight: 700, color: "#e2e8f0", margin: 0 },
  sub: { fontSize: 11, color: "#3a4a6a", marginTop: 6 },
  addBtn: {
    background: "#1d4ed8",
    border: "none",
    borderRadius: 6,
    padding: "10px 18px",
    fontSize: 11,
    fontWeight: 700,
    color: "#fff",
    cursor: "pointer",
    fontFamily: "'DM Mono', monospace",
    letterSpacing: "0.06em",
  },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 14 },
  loading: { color: "#3a4a6a", fontSize: 13 },
  empty: { display: "flex", justifyContent: "center", padding: "60px 0" },
};
