// pages/Cameras.jsx — Camera management (list, add, edit, restart)
import { useEffect, useState } from "react";
import { camerasAPI, pipelinesAPI } from "../api/client";
import { formatIST } from "../utils/date";

const STATUS_STYLE = {
  online: { color: "#10b981", dot: "#10b981", label: "ONLINE" },
  offline: { color: "#ef4444", dot: "#ef4444", label: "OFFLINE" },
  error: { color: "#f59e0b", dot: "#f59e0b", label: "ERROR" },
  paused: { color: "#6b7280", dot: "#6b7280", label: "PAUSED" },
};

const BLANK_FORM = {
  name: "",
  stream_url: "",
  pipeline_id: "",
  frame_interval_seconds: "",
  alert_threshold: "",
  mm_per_pixel: "",
  is_active: true,
};

export default function Cameras() {
  const [cameras, setCameras] = useState([]);
  const [pipelines, setPipelines] = useState([]);

  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editCam, setEditCam] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [restartingId, setRestartingId] = useState(null);

  const [showPipelineForm, setShowPipelineForm] = useState(false);
  const [pipelineForm, setPipelineForm] = useState({
    name: "",
    description: "",
  });
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [pipelineError, setPipelineError] = useState("");

  const fetchCameras = async () => {
    try {
      const { data } = await camerasAPI.list();
      setCameras(data || []);
    } catch (error) {
      console.error("Failed to load cameras:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPipelines = async () => {
    try {
      const { data } = await pipelinesAPI.list();
      setPipelines(data || []);
    } catch (error) {
      console.error("Failed to load pipelines:", error);
    }
  };

  useEffect(() => {
    fetchCameras();
    fetchPipelines();
  }, []);

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
      pipeline_id: cam.pipeline_id ?? "",
      frame_interval_seconds: cam.frame_interval_seconds ?? "",
      alert_threshold: cam.alert_threshold ?? "",
      mm_per_pixel: cam.mm_per_pixel ?? "",
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
      pipeline_id: form.pipeline_id
        ? parseInt(form.pipeline_id)
        : null,
      frame_interval_seconds: form.frame_interval_seconds
        ? parseInt(form.frame_interval_seconds)
        : null,
      alert_threshold: form.alert_threshold
        ? parseFloat(form.alert_threshold)
        : null,
      mm_per_pixel: form.mm_per_pixel
        ? parseFloat(form.mm_per_pixel)
        : null,
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

  const openAddPipeline = () => {
    setPipelineForm({
      name: "",
      description: "",
    });
    setPipelineError("");
    setShowPipelineForm(true);
  };

  const handlePipelineSubmit = async (e) => {
    e.preventDefault();
    setPipelineLoading(true);
    setPipelineError("");

    try {
      await pipelinesAPI.create({
        name: pipelineForm.name,
        description: pipelineForm.description || null,
      });

      setShowPipelineForm(false);
      await fetchPipelines();
    } catch (err) {
      setPipelineError(
        err.response?.data?.detail || "Failed to create pipeline."
      );
    } finally {
      setPipelineLoading(false);
    }
  };

  return (
    <div style={p.root}>
      <div style={p.header}>
        <div>
          <h1 style={p.title}>Camera Management</h1>
          <div style={p.sub}>
            {cameras.length} registered camera{cameras.length !== 1 ? "s" : ""}
          </div>
        </div>

        <div style={p.headerActions}>
          <button onClick={openAddPipeline} style={p.pipelineBtn}>
            + Add Pipeline
          </button>

          <button onClick={openAdd} style={p.addBtn}>
            + Add Camera
          </button>
        </div>
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
        <div>
        {[
          ...pipelines.map((pipeline) => ({
            ...pipeline,
            pipelineCameras: cameras.filter(
              (cam) => cam.pipeline_id === pipeline.id
            ),
          })),
          {
            id: "unassigned",
            name: "UNASSIGNED",
            pipelineCameras: cameras.filter(
              (cam) => !cam.pipeline_id
            ),
          },
        ]
          .filter((group) => group.pipelineCameras.length > 0)
          .map((group) => (
            <div key={group.id} style={p.pipelineGroup}>
              {/* Pipeline heading */}
              <div style={p.pipelineHeader}>
                <div>
                  <div style={p.pipelineName}>
                    {group.name}
                  </div>

                  <div style={p.pipelineSub}>
                    {group.pipelineCameras.length} camera
                    {group.pipelineCameras.length !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>

              {/* Cameras in this pipeline */}
              <div style={p.grid}>
                {group.pipelineCameras.map((cam) => {
                  const st =
                    STATUS_STYLE[cam.status] ||
                    STATUS_STYLE.offline;

                  return (
                    <div key={cam.id} style={camCard.root}>
                      <div style={camCard.topRow}>
                        <div>
                          <div style={camCard.name}>
                            {cam.name}
                          </div>

                          <div style={camCard.id}>
                            ID #{cam.id}
                          </div>
                        </div>

                        <div
                          style={{
                            ...camCard.statusBadge,
                            color: st.color,
                            background: `${st.dot}18`,
                          }}
                        >
                          <span
                            style={{
                              ...camCard.statusDot,
                              background: st.dot,
                            }}
                          />

                          {st.label}
                        </div>
                      </div>

                      <div style={camCard.urlWrap}>
                        <span style={camCard.urlLabel}>
                          STREAM URL
                        </span>

                        <span
                          style={camCard.url}
                          title={cam.stream_url}
                        >
                          {cam.stream_url.length > 50
                            ? cam.stream_url.slice(0, 50) + "…"
                            : cam.stream_url}
                        </span>
                      </div>

                      <div style={camCard.paramRow}>
                        <Param
                          label="Interval"
                          value={
                            cam.frame_interval_seconds
                              ? `${cam.frame_interval_seconds}s`
                              : "default"
                          }
                        />

                        <Param
                          label="Threshold"
                          value={
                            cam.alert_threshold != null
                              ? `${(
                                  cam.alert_threshold * 100
                                ).toFixed(0)}%`
                              : "default"
                          }
                        />

                        <Param
                          label="Active"
                          value={cam.is_active ? "Yes" : "No"}
                        />

                        <Param
                          label="Scale"
                          value={
                            cam.mm_per_pixel != null
                              ? `${Number(cam.mm_per_pixel).toFixed(4)} mm/px`
                              : "Not calibrated"
                          }
                        />

                        <Param
                          label="Last Seen"
                          value={
                            cam.last_seen_at
                              ? formatIST(cam.last_seen_at)
                              : "—"
                          }
                        />
                      </div>

                      <div style={camCard.actions}>
                        <button
                          onClick={() =>
                            handleRestart(cam.id)
                          }
                          disabled={
                            restartingId === cam.id
                          }
                          style={camCard.btn}
                        >
                          {restartingId === cam.id
                            ? "Restarting…"
                            : "Restart"}
                        </button>

                        <button
                          onClick={() => openEdit(cam)}
                          style={camCard.btn}
                        >
                          Edit
                        </button>

                        <button
                          onClick={() =>
                            handleDelete(cam.id)
                          }
                          style={{
                            ...camCard.btn,
                            color: "#ef4444",
                            borderColor:
                              "rgba(239,68,68,0.3)",
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
      </div>
      )}

      {/* Add/Edit Camera modal */}
      {showForm && (
        <div
          style={modal.overlay}
          onClick={() => setShowForm(false)}
        >
          <div
            style={modal.box}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={modal.header}>
              <span style={modal.title}>
                {editCam ? "Edit Camera" : "Add Camera"}
              </span>

              <button
                onClick={() => setShowForm(false)}
                style={modal.close}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} style={modal.form}>
              <Field
                label="Name *"
                type="text"
                value={form.name}
                onChange={(v) =>
                  setForm((f) => ({ ...f, name: v }))
                }
                required
              />

              <Field
                label="Stream URL (RTSP / HTTP) *"
                type="text"
                value={form.stream_url}
                placeholder="rtsp://192.168.1.100/stream or http://..."
                onChange={(v) =>
                  setForm((f) => ({ ...f, stream_url: v }))
                }
                required
              />

              <div>
                <label style={modal.label}>
                  PIPELINE
                </label>

                <select
                  value={form.pipeline_id}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      pipeline_id: e.target.value,
                    }))
                  }
                  style={modal.select}
                >
                  <option value="">No Pipeline</option>

                  {pipelines.map((pipeline) => (
                    <option key={pipeline.id} value={pipeline.id}>
                      {pipeline.name}
                    </option>
                  ))}
                </select>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                }}
              >
                <Field
                  label="Frame Interval (s)"
                  type="number"
                  value={form.frame_interval_seconds}
                  placeholder="5"
                  onChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      frame_interval_seconds: v,
                    }))
                  }
                />

                <Field
                  label="Alert Threshold (0–1)"
                  type="number"
                  value={form.alert_threshold}
                  placeholder="0.45"
                  step="0.05"
                  min="0"
                  max="1"
                  onChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      alert_threshold: v,
                    }))
                  }
                />
              </div>

              <Field
                label="Scale (mm per pixel)"
                type="number"
                value={form.mm_per_pixel}
                placeholder="e.g. 0.25"
                step="any"
                min="0"
                onChange={(v) =>
                  setForm((f) => ({ ...f, mm_per_pixel: v }))
                }
              />

              <label style={modal.checkLabel}>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      is_active: e.target.checked,
                    }))
                  }
                />

                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 12,
                    color: "#94a3b8",
                  }}
                >
                  Active (start capturing immediately)
                </span>
              </label>

              {formError && (
                <div style={modal.error}>{formError}</div>
              )}

              <div style={modal.btnRow}>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  style={modal.cancelBtn}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={formLoading}
                  style={modal.saveBtn}
                >
                  {formLoading
                    ? "Saving…"
                    : editCam
                    ? "Save Changes"
                    : "Add Camera"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Pipeline modal */}
      {showPipelineForm && (
        <div
          style={modal.overlay}
          onClick={() => setShowPipelineForm(false)}
        >
          <div
            style={modal.box}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={modal.header}>
              <span style={modal.title}>Add Pipeline</span>

              <button
                onClick={() => setShowPipelineForm(false)}
                style={modal.close}
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handlePipelineSubmit}
              style={modal.form}
            >
              <Field
                label="Name *"
                type="text"
                value={pipelineForm.name}
                placeholder="e.g. NH-48 Bridge"
                onChange={(v) =>
                  setPipelineForm((f) => ({
                    ...f,
                    name: v,
                  }))
                }
                required
              />

              <Field
                label="Description"
                type="text"
                value={pipelineForm.description}
                placeholder="Main bridge monitoring"
                onChange={(v) =>
                  setPipelineForm((f) => ({
                    ...f,
                    description: v,
                  }))
                }
              />

              {pipelineError && (
                <div style={modal.error}>
                  {pipelineError}
                </div>
              )}

              <div style={modal.btnRow}>
                <button
                  type="button"
                  onClick={() => setShowPipelineForm(false)}
                  style={modal.cancelBtn}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={pipelineLoading}
                  style={modal.saveBtn}
                >
                  {pipelineLoading ? "Saving…" : "Add Pipeline"}
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
      <div
        style={{
          fontSize: 9,
          color: "var(--text-muted)",
          letterSpacing: "0.1em",
          marginBottom: 2,
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: 12,
          color: "var(--text-secondary)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Field({ label, onChange, ...rest }) {
  return (
    <div>
      <label
        style={{
          fontSize: 9,
          color: "#4a5a7a",
          letterSpacing: "0.1em",
          display: "block",
          marginBottom: 5,
        }}
      >
        {label}
      </label>

      <input
        {...rest}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          background: "var(--bg)",
          border: "1px solid var(--border-strong)",
          borderRadius: 6,
          padding: "9px 12px",
          fontSize: 12,
          color: "var(--text)",
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
    background: "var(--panel)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "18px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },

  topRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },

  name: {
    fontSize: 16,
    fontWeight: 700,
    color: "var(--text)",
  },

  id: {
    fontSize: 10,
    color: "var(--text-muted)",
    marginTop: 3,
  },

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

  statusDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    flexShrink: 0,
  },

  urlWrap: {},

  urlLabel: {
    fontSize: 9,
    color: "var(--text-muted)",
    letterSpacing: "0.1em",
    display: "block",
    marginBottom: 3,
  },

  url: {
    fontSize: 11,
    color: "var(--text-secondary)",
    wordBreak: "break-all",
  },

  pipelineWrap: {},

  pipeline: {
    fontSize: 11,
    color: "var(--text-secondary)",
  },

  paramRow: {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: 10,
  },

  actions: {
    display: "flex",
    gap: 8,
    marginTop: 4,
  },

  btn: {
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: 5,
    padding: "7px 14px",
    fontSize: 11,
    color: "var(--text-secondary)",
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
    background: "var(--panel)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    width: "100%",
    maxWidth: 500,
    boxShadow: "0 0 60px rgba(0,0,0,0.25)",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "18px 22px 14px",
    borderBottom: "1px solid var(--border)",
  },

  title: {
    fontSize: 15,
    fontWeight: 700,
    color: "var(--text)",
  },

  close: {
    background: "none",
    border: "1px solid var(--border)",
    borderRadius: 4,
    color: "var(--text-muted)",
    cursor: "pointer",
    padding: "3px 9px",
    fontSize: 13,
  },

  form: {
    padding: "20px 22px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },

  label: {
    fontSize: 9,
    color: "var(--text-muted)",
    letterSpacing: "0.1em",
    display: "block",
    marginBottom: 5,
  },

  select: {
    width: "100%",
    background: "var(--input-bg)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "9px 12px",
    fontSize: 12,
    color: "var(--text)",
    fontFamily: "'DM Mono', monospace",
    outline: "none",
    boxSizing: "border-box",
  },

  checkLabel: {
    display: "flex",
    alignItems: "center",
    fontSize: 12,
  },

  error: {
    padding: "9px 12px",
    background: "rgba(163,69,58,0.1)",
    border: "1px solid rgba(163,69,58,0.3)",
    borderRadius: 6,
    fontSize: 11,
    color: "var(--red)",
  },

  btnRow: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
  },

  cancelBtn: {
    background: "none",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "9px 18px",
    fontSize: 11,
    color: "var(--text-muted)",
    cursor: "pointer",
    fontFamily: "inherit",
  },

  saveBtn: {
    background: "var(--navy)",
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
  root: {
    padding: "32px 36px",
    fontFamily: "'DM Mono', monospace",
    color: "var(--text)",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 28,
  },

  headerActions: {
    display: "flex",
    gap: 10,
  },

  title: {
    fontSize: 22,
    fontWeight: 700,
    color: "var(--text)",
    margin: 0,
  },

  sub: {
    fontSize: 11,
    color: "var(--text-muted)",
    marginTop: 6,
  },

  pipelineBtn: {
    background: "var(--panel)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "10px 18px",
    fontSize: 11,
    fontWeight: 700,
    color: "var(--text-secondary)",
    cursor: "pointer",
    fontFamily: "'DM Mono', monospace",
    letterSpacing: "0.06em",
  },

  addBtn: {
    background: "var(--navy)",
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

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
    gap: 14,
  },

  loading: {
    color: "var(--text-muted)",
    fontSize: 13,
  },

  empty: {
    display: "flex",
    justifyContent: "center",
    padding: "60px 0",
  },

  pipelineGroup: {
    marginBottom: 30,
  },

  pipelineHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingBottom: 8,
    borderBottom: "1px solid var(--border)",
  },

  pipelineName: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--text)",
    letterSpacing: "0.04em",
  },

  pipelineSub: {
    fontSize: 10,
    color: "var(--text-muted)",
    marginTop: 4,
  },
};