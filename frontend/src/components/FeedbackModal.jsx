// components/FeedbackModal.jsx — Officer verdict submission modal
import { useState } from "react";
import { feedbackAPI } from "../api/client";

const VERDICTS = [
  {
    key: "true_positive",
    label: "True Positive",
    desc: "Confirmed crack — model was correct",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.1)",
    border: "rgba(239,68,68,0.3)",
    icon: "✓",
  },
  {
    key: "false_positive",
    label: "False Positive",
    desc: "No actual crack — model was wrong",
    color: "#6b7280",
    bg: "rgba(107,114,128,0.1)",
    border: "rgba(107,114,128,0.3)",
    icon: "✗",
  },
  {
    key: "needs_inspection",
    label: "Needs Inspection",
    desc: "Ambiguous — physical inspection required",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.1)",
    border: "rgba(245,158,11,0.3)",
    icon: "?",
  },
];

export default function FeedbackModal({ inference, onClose, onSubmitted }) {
  const [selected, setSelected] = useState(
    inference.feedback?.verdict || null
  );
  const [comment, setComment] = useState(inference.feedback?.comment || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isEdit = !!inference.feedback;

  const handleSubmit = async () => {
    if (!selected) return;
    setLoading(true);
    setError("");
    try {
      if (isEdit) {
        await feedbackAPI.update(inference.id, { verdict: selected, comment: comment || null });
      } else {
        await feedbackAPI.submit(inference.id, { verdict: selected, comment: comment || null });
      }
      onSubmitted?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || "Submission failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={s.header}>
          <div>
            <div style={s.headerTitle}>Officer Verification</div>
            <div style={s.headerSub}>Frame {inference.frame_id?.slice(0, 8)}…</div>
          </div>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>

        {/* Inference metadata */}
        <div style={s.metaRow}>
          <MetaItem label="Confidence" value={`${(inference.max_confidence * 100).toFixed(1)}%`} />
          <MetaItem label="Detections" value={inference.num_detections} />
          <MetaItem label="Camera" value={`#${inference.camera_id}`} />
          <MetaItem label="Captured" value={new Date(inference.captured_at).toLocaleString()} />
        </div>

        {/* Verdict selection */}
        <div style={s.section}>
          <div style={s.sectionLabel}>SELECT VERDICT</div>
          <div style={s.verdictGrid}>
            {VERDICTS.map((v) => (
              <button
                key={v.key}
                onClick={() => setSelected(v.key)}
                style={{
                  ...s.verdictBtn,
                  background: selected === v.key ? v.bg : "#0a0e17",
                  borderColor: selected === v.key ? v.color : "#1e2942",
                }}
              >
                <div style={{ ...s.verdictIcon, color: v.color }}>{v.icon}</div>
                <div style={{ ...s.verdictLabel, color: selected === v.key ? v.color : "#94a3b8" }}>
                  {v.label}
                </div>
                <div style={s.verdictDesc}>{v.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Comment */}
        <div style={s.section}>
          <div style={s.sectionLabel}>COMMENT (OPTIONAL)</div>
          <textarea
            style={s.textarea}
            placeholder="Add notes, location details, severity assessment…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
          />
        </div>

        {error && <div style={s.error}>{error}</div>}

        {/* Actions */}
        <div style={s.actions}>
          <button onClick={onClose} style={s.cancelBtn}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={!selected || loading}
            style={{
              ...s.submitBtn,
              opacity: !selected || loading ? 0.4 : 1,
              cursor: !selected || loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Submitting…" : isEdit ? "Update Verdict" : "Submit Verdict"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MetaItem({ label, value }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 9, color: "#3a4a6a", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: "#94a3b8" }}>{value}</div>
    </div>
  );
}

const s = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.75)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    backdropFilter: "blur(4px)",
    fontFamily: "'DM Mono', monospace",
  },
  modal: {
    background: "#0d1321",
    border: "1px solid #1e2942",
    borderRadius: 12,
    width: "100%",
    maxWidth: 560,
    maxHeight: "90vh",
    overflowY: "auto",
    boxShadow: "0 0 60px rgba(0,0,0,0.6)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "20px 24px 16px",
    borderBottom: "1px solid #1e2942",
  },
  headerTitle: { fontSize: 16, fontWeight: 700, color: "#e2e8f0" },
  headerSub: { fontSize: 11, color: "#3a4a6a", marginTop: 3 },
  closeBtn: {
    background: "none",
    border: "1px solid #1e2942",
    borderRadius: 4,
    color: "#4a5a7a",
    cursor: "pointer",
    padding: "4px 10px",
    fontSize: 14,
    fontFamily: "inherit",
  },
  metaRow: {
    display: "flex",
    gap: 0,
    padding: "16px 24px",
    borderBottom: "1px solid #111827",
    background: "#080c14",
  },
  section: { padding: "16px 24px" },
  sectionLabel: { fontSize: 9, color: "#3a4a6a", letterSpacing: "0.15em", marginBottom: 10, fontWeight: 700 },
  verdictGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 },
  verdictBtn: {
    border: "1px solid",
    borderRadius: 8,
    padding: "14px 12px",
    cursor: "pointer",
    textAlign: "left",
    transition: "all 0.15s",
    fontFamily: "'DM Mono', monospace",
  },
  verdictIcon: { fontSize: 18, fontWeight: 700, marginBottom: 6 },
  verdictLabel: { fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", marginBottom: 4 },
  verdictDesc: { fontSize: 10, color: "#3a4a6a", lineHeight: 1.4 },
  textarea: {
    width: "100%",
    background: "#080c14",
    border: "1px solid #1e2942",
    borderRadius: 6,
    padding: "10px 12px",
    fontSize: 12,
    color: "#e2e8f0",
    fontFamily: "'DM Mono', monospace",
    resize: "vertical",
    outline: "none",
    boxSizing: "border-box",
  },
  error: {
    margin: "0 24px 16px",
    padding: "10px 14px",
    background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: 6,
    fontSize: 12,
    color: "#fca5a5",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    padding: "16px 24px",
    borderTop: "1px solid #1e2942",
  },
  cancelBtn: {
    background: "none",
    border: "1px solid #1e2942",
    borderRadius: 6,
    padding: "10px 20px",
    fontSize: 12,
    color: "#4a5a7a",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  submitBtn: {
    background: "#1d4ed8",
    border: "none",
    borderRadius: 6,
    padding: "10px 24px",
    fontSize: 12,
    fontWeight: 700,
    color: "#fff",
    fontFamily: "inherit",
    letterSpacing: "0.06em",
  },
};
