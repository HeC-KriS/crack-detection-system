// Pick 2 points on the detected image to set the scale
import { useRef, useState } from "react";
import { inferencesAPI } from "../api/client";

export default function CalibrateModal({ inferenceId, imageSrc, onClose, onSaved }) {
  const imgRef = useRef(null);
  const [size, setSize] = useState({ w: 1, h: 1 });   // natural image size
  const [points, setPoints] = useState([]);            // in real image pixels
  const [realMm, setRealMm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleClick = (e) => {
    if (points.length >= 2) return;
    const img = imgRef.current;
    const rect = img.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (img.naturalWidth / rect.width);
    const y = (e.clientY - rect.top) * (img.naturalHeight / rect.height);
    setPoints((p) => [...p, { x, y }]);
  };

  const pxDist =
    points.length === 2
      ? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
      : 0;
  const mm = parseFloat(realMm);
  const scale = pxDist > 0 && mm > 0 ? mm / pxDist : null;

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await inferencesAPI.setScale(inferenceId, scale);
      onSaved();
      onClose();
    } catch (err) {
      const d = err.response?.data?.detail;
      setError(typeof d === "string" ? d : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const r = size.w * 0.006;   // dot size relative to image width

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.box} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <span style={s.title}>Set camera scale from image</span>
          <button onClick={onClose} style={s.close}>✕</button>
        </div>

        <div style={s.hint}>
          {points.length < 2
            ? `Click point ${points.length + 1} of 2 on something of known size (ruler, brick, door width).`
            : "Enter the real distance. This scale will apply to ALL images from this camera."}
        </div>

        <div style={s.imgScroll}>
          <div style={{ position: "relative", lineHeight: 0 }}>
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Calibration"
              onClick={handleClick}
              onLoad={(e) =>
                setSize({ w: e.target.naturalWidth, h: e.target.naturalHeight })
              }
              style={{ width: "100%", display: "block", cursor: "crosshair" }}
            />
            <svg
              viewBox={`0 0 ${size.w} ${size.h}`}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
            >
              {points.length === 2 && (
                <line
                  x1={points[0].x} y1={points[0].y}
                  x2={points[1].x} y2={points[1].y}
                  stroke="#22d3ee" strokeWidth={r * 0.6}
                />
              )}
              {points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={r} fill="#22d3ee" stroke="#000" strokeWidth={r * 0.25} />
              ))}
            </svg>
          </div>
        </div>

        <div style={s.controls}>
          <div>
            <label style={s.label}>REAL DISTANCE (mm)</label>
            <input
              type="number" step="any" min="0" value={realMm}
              onChange={(e) => setRealMm(e.target.value)}
              placeholder="e.g. 300"
              disabled={points.length < 2}
              style={s.input}
            />
          </div>
          <div style={s.result}>
            {scale
              ? `${pxDist.toFixed(0)} px = ${mm} mm → ${scale.toFixed(4)} mm/px`
              : "Scale not set"}
          </div>
        </div>

        {error && <div style={s.error}>{error}</div>}

        <div style={s.btnRow}>
          <button onClick={() => setPoints([])} style={s.cancelBtn}>Reset points</button>
          <button onClick={onClose} style={s.cancelBtn}>Cancel</button>
          <button onClick={handleSave} disabled={!scale || saving} style={{ ...s.saveBtn, opacity: !scale || saving ? 0.5 : 1 }}>
            {saving ? "Saving…" : "Apply scale"}
          </button>
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex",
    alignItems: "center", justifyContent: "center", zIndex: 1000,
    fontFamily: "'DM Mono', monospace",
  },
  box: {
    background: "#0d1321", border: "1px solid #1e2942", borderRadius: 10,
    width: "100%", maxWidth: 900, maxHeight: "92vh", display: "flex",
    flexDirection: "column", boxShadow: "0 0 60px rgba(0,0,0,0.5)",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "16px 20px", borderBottom: "1px solid #1e2942",
  },
  title: { fontSize: 15, fontWeight: 700, color: "#e2e8f0" },
  close: {
    background: "none", border: "1px solid #1e2942", borderRadius: 4,
    color: "#4a5a7a", cursor: "pointer", padding: "3px 9px", fontSize: 13,
  },
  hint: { fontSize: 11, color: "#94a3b8", padding: "10px 20px 0" },
  imgScroll: { padding: "10px 20px", overflow: "auto", flex: 1 },
  controls: {
    display: "flex", gap: 20, alignItems: "flex-end", padding: "0 20px 12px",
  },
  label: { fontSize: 9, color: "#4a5a7a", letterSpacing: "0.1em", display: "block", marginBottom: 5 },
  input: {
    background: "#080c14", border: "1px solid #1e2942", borderRadius: 6,
    padding: "9px 12px", fontSize: 12, color: "#e2e8f0",
    fontFamily: "'DM Mono', monospace", width: 160, boxSizing: "border-box",
  },
  result: { fontSize: 12, color: "#22d3ee", paddingBottom: 9 },
  error: {
    margin: "0 20px 12px", padding: "9px 12px", background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, fontSize: 11, color: "#fca5a5",
  },
  btnRow: { display: "flex", justifyContent: "flex-end", gap: 10, padding: "0 20px 18px" },
  cancelBtn: {
    background: "none", border: "1px solid #1e2942", borderRadius: 6,
    padding: "9px 18px", fontSize: 11, color: "#4a5a7a", cursor: "pointer", fontFamily: "inherit",
  },
  saveBtn: {
    background: "#1d4ed8", border: "none", borderRadius: 6, padding: "9px 22px",
    fontSize: 11, fontWeight: 700, color: "#fff", cursor: "pointer", fontFamily: "inherit",
  },
};