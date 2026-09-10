// pages/Queue.jsx — Officer verification queue
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { inferencesAPI } from "../api/client";
import FeedbackModal from "../components/FeedbackModal";

const VERDICT_STYLES = {
  true_positive: { color: "#ef4444", bg: "rgba(239,68,68,0.1)", label: "TRUE POSITIVE" },
  false_positive: { color: "#6b7280", bg: "rgba(107,114,128,0.1)", label: "FALSE POSITIVE" },
  needs_inspection: { color: "#f59e0b", bg: "rgba(245,158,11,0.1)", label: "INSPECT" },
};

function SegmentationOverlay({ segmentations, imageRef }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !imageRef.current || !segmentations?.length) return;
    const img = imageRef.current;
    const canvas = canvasRef.current;

    const draw = () => {
      canvas.width = img.clientWidth;
      canvas.height = img.clientHeight;
      const scaleX = img.clientWidth / img.naturalWidth;
      const scaleY = img.clientHeight / img.naturalHeight;

      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      segmentations.forEach((seg) => {
        if (!seg.polygon?.length) return;
        ctx.beginPath();
        seg.polygon.forEach(([x, y], i) => {
          const sx = x * scaleX, sy = y * scaleY;
          i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
        });
        ctx.closePath();
        ctx.fillStyle = "rgba(239,68,68,0.25)";
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
      });
    };

    if (img.complete) draw();
    else img.addEventListener("load", draw);
    return () => img.removeEventListener("load", draw);
  }, [segmentations, imageRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    />
  );
}

function InferenceCard({ item, highlighted, onVerify }) {
  const imageRef = useRef(null);
  const [imgError, setImgError] = useState(false);
  const verdict = item.feedback ? VERDICT_STYLES[item.feedback.verdict] : null;

  return (
    <div
      style={{
        ...c.card,
        border: highlighted ? "1px solid #f59e0b" : "1px solid #1e2942",
        boxShadow: highlighted ? "0 0 20px rgba(245,158,11,0.15)" : "none",
      }}
    >
      {/* Image area */}
      <div style={c.imageWrap}>
        {item.annotated_image_url && !imgError ? (
          <>
            <img
              ref={imageRef}
              src={item.annotated_image_url}
              alt="Annotated crack detection"
              style={c.image}
              onError={() => setImgError(true)}
            />
            {item.segmentations?.length > 0 && (
              <SegmentationOverlay
                segmentations={item.segmentations}
                imageRef={imageRef}
              />
            )}
          </>
        ) : (
          <div style={c.noImage}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2a3a5a" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <span style={{ fontSize: 11, color: "#2a3a5a", marginTop: 8 }}>
              {imgError ? "Image unavailable" : "No image stored"}
            </span>
          </div>
        )}

        {/* Confidence badge */}
        <div style={{
          ...c.confBadge,
          background: item.max_confidence > 0.7
            ? "rgba(239,68,68,0.9)"
            : "rgba(245,158,11,0.9)",
        }}>
          {(item.max_confidence * 100).toFixed(0)}%
        </div>
      </div>

      {/* Card body */}
      <div style={c.body}>
        <div style={c.topRow}>
          <div>
            <div style={c.camLabel}>
              CAM {item.camera_id}
              {item.camera_name && <span style={c.camName}> · {item.camera_name}</span>}
            </div>
            <div style={c.timestamp}>{new Date(item.captured_at).toLocaleString()}</div>
          </div>
          {verdict ? (
            <div style={{ ...c.verdictBadge, color: verdict.color, background: verdict.bg }}>
              {verdict.label}
            </div>
          ) : (
            <div style={c.pendingBadge}>PENDING</div>
          )}
        </div>

        <div style={c.detailRow}>
          <Chip label={`${item.num_detections} detection${item.num_detections !== 1 ? "s" : ""}`} />
          {item.segmentations?.length > 0 && <Chip label={`${item.segmentations.length} segment`} accent />}
          {item.inference_latency_ms && (
            <Chip label={`${item.inference_latency_ms.toFixed(0)}ms`} />
          )}
        </div>

        {item.feedback?.comment && (
          <div style={c.comment}>"{item.feedback.comment}"</div>
        )}

        <button
          onClick={() => onVerify(item)}
          style={{
            ...c.verifyBtn,
            background: item.is_verified ? "#0d1a2e" : "#1d4ed8",
            color: item.is_verified ? "#3b82f6" : "#fff",
            border: item.is_verified ? "1px solid #1e3a5c" : "none",
          }}
        >
          {item.is_verified ? "Edit Verdict" : "Submit Verdict"}
        </button>
      </div>
    </div>
  );
}

function Chip({ label, accent }) {
  return (
    <span style={{
      fontSize: 10,
      padding: "3px 7px",
      borderRadius: 4,
      background: accent ? "rgba(59,130,246,0.1)" : "#0a0e17",
      border: `1px solid ${accent ? "rgba(59,130,246,0.3)" : "#1e2942"}`,
      color: accent ? "#60a5fa" : "#4a5a7a",
      letterSpacing: "0.04em",
    }}>
      {label}
    </span>
  );
}

export default function Queue() {
  const [searchParams] = useSearchParams();
  const highlight = searchParams.get("highlight");

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending"); // pending | all | verified
  const [selected, setSelected] = useState(null); // for modal

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, page_size: 12, crack_only: true };
      if (filter === "pending") params.verified = false;
      if (filter === "verified") params.verified = true;
      const { data } = await inferencesAPI.list(params);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error("Queue fetch failed", e);
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const totalPages = Math.ceil(total / 12);

  return (
    <div style={p.root}>
      {/* Header */}
      <div style={p.header}>
        <div>
          <h1 style={p.title}>Verification Queue</h1>
          <div style={p.sub}>{total} record{total !== 1 ? "s" : ""} · Select a detection to submit your verdict</div>
        </div>
        <div style={p.filters}>
          {["pending", "all", "verified"].map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(1); }}
              style={{
                ...p.filterBtn,
                background: filter === f ? "#1d4ed8" : "#0d1321",
                color: filter === f ? "#fff" : "#4a5a7a",
                border: `1px solid ${filter === f ? "#1d4ed8" : "#1e2942"}`,
              }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div style={p.loading}>Loading records…</div>
      ) : items.length === 0 ? (
        <div style={p.empty}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#1e2942" strokeWidth="1.5">
            <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
          </svg>
          <p style={{ color: "#3a4a6a", marginTop: 12, fontSize: 13 }}>
            {filter === "pending" ? "No pending verifications. All clear!" : "No records found."}
          </p>
        </div>
      ) : (
        <div style={p.grid}>
          {items.map((item) => (
            <InferenceCard
              key={item.id}
              item={item}
              highlighted={highlight === item.frame_id}
              onVerify={setSelected}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={p.pagination}>
          <button
            onClick={() => setPage((x) => Math.max(1, x - 1))}
            disabled={page === 1}
            style={p.pageBtn}
          >
            ← Prev
          </button>
          <span style={p.pageInfo}>Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((x) => Math.min(totalPages, x + 1))}
            disabled={page === totalPages}
            style={p.pageBtn}
          >
            Next →
          </button>
        </div>
      )}

      {/* Feedback modal */}
      {selected && (
        <FeedbackModal
          inference={selected}
          onClose={() => setSelected(null)}
          onSubmitted={fetchItems}
        />
      )}
    </div>
  );
}

const c = {
  card: {
    background: "#0d1321",
    borderRadius: 10,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  imageWrap: {
    position: "relative",
    aspectRatio: "16/9",
    background: "#080c14",
    overflow: "hidden",
  },
  image: { width: "100%", height: "100%", objectFit: "contain", display: "block" },
  noImage: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  },
  confBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 800,
    color: "#fff",
    letterSpacing: "0.02em",
  },
  body: { padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, flex: 1 },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  camLabel: { fontSize: 14, fontWeight: 700, color: "#e2e8f0" },
  camName: { fontWeight: 400, color: "#4a5a7a" },
  timestamp: { fontSize: 11, color: "#3a4a6a", marginTop: 3 },
  verdictBadge: {
    fontSize: 9,
    padding: "3px 8px",
    borderRadius: 4,
    fontWeight: 700,
    letterSpacing: "0.08em",
    flexShrink: 0,
  },
  pendingBadge: {
    fontSize: 9,
    padding: "3px 8px",
    borderRadius: 4,
    fontWeight: 700,
    letterSpacing: "0.08em",
    background: "rgba(245,158,11,0.1)",
    color: "#f59e0b",
    flexShrink: 0,
  },
  detailRow: { display: "flex", gap: 6, flexWrap: "wrap" },
  comment: {
    fontSize: 11,
    color: "#4a5a7a",
    fontStyle: "italic",
    background: "#080c14",
    padding: "8px 10px",
    borderRadius: 4,
    borderLeft: "2px solid #1e2942",
  },
  verifyBtn: {
    padding: "10px",
    border: "none",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: "0.06em",
    fontFamily: "'DM Mono', monospace",
    transition: "all 0.15s",
    marginTop: "auto",
  },
};

const p = {
  root: { padding: "32px 36px", fontFamily: "'DM Mono', monospace" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 28,
    flexWrap: "wrap",
    gap: 16,
  },
  title: { fontSize: 22, fontWeight: 700, color: "#e2e8f0", margin: 0 },
  sub: { fontSize: 11, color: "#3a4a6a", marginTop: 6 },
  filters: { display: "flex", gap: 6 },
  filterBtn: {
    padding: "8px 14px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    letterSpacing: "0.06em",
    fontFamily: "'DM Mono', monospace",
    textTransform: "capitalize",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: 16,
  },
  loading: { color: "#3a4a6a", fontSize: 13, padding: "60px 0", textAlign: "center" },
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "80px 0",
  },
  pagination: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginTop: 32,
  },
  pageBtn: {
    background: "#0d1321",
    border: "1px solid #1e2942",
    borderRadius: 6,
    padding: "8px 16px",
    color: "#4a5a7a",
    cursor: "pointer",
    fontFamily: "'DM Mono', monospace",
    fontSize: 12,
  },
  pageInfo: { fontSize: 12, color: "#3a4a6a" },
};
