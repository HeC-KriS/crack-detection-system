// pages/History.jsx — All reviewed inference records with filtering
import { useCallback, useEffect, useState } from "react";
import { inferencesAPI, statsAPI } from "../api/client";

const VERDICT_MAP = {
  true_positive: { label: "True Positive", color: "#ef4444" },
  false_positive: { label: "False Positive", color: "#6b7280" },
  needs_inspection: { label: "Needs Inspection", color: "#f59e0b" },
};

function TableRow({ item }) {
  const v = item.feedback ? VERDICT_MAP[item.feedback.verdict] : null;

  return (
    <tr style={t.row}>
      <td style={t.cell}>{new Date(item.captured_at).toLocaleString()}</td>
      <td style={t.cell}>CAM {item.camera_id}{item.camera_name ? ` · ${item.camera_name}` : ""}</td>
      <td style={t.cell}>
        <span style={{
          ...t.confChip,
          color: item.max_confidence > 0.7 ? "#ef4444" : "#f59e0b",
          background: item.max_confidence > 0.7 ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)",
        }}>
          {(item.max_confidence * 100).toFixed(1)}%
        </span>
      </td>
      <td style={t.cell}>{item.num_detections}</td>
      <td style={t.cell}>
        {v ? (
          <span style={{ ...t.verdictChip, color: v.color }}>{v.label}</span>
        ) : (
          <span style={{ ...t.verdictChip, color: "#4a5a7a" }}>Pending</span>
        )}
      </td>
      <td style={{ ...t.cell, color: "#4a5a7a", maxWidth: 200 }}>
        {item.feedback?.comment ? (
          <span title={item.feedback.comment}>
            {item.feedback.comment.length > 60
              ? item.feedback.comment.slice(0, 60) + "…"
              : item.feedback.comment}
          </span>
        ) : "—"}
      </td>
      <td style={t.cell}>{item.inference_latency_ms ? `${item.inference_latency_ms.toFixed(0)}ms` : "—"}</td>
    </tr>
  );
}

export default function History() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await inferencesAPI.list({ page, page_size: 25, crack_only: true });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const { data } = await statsAPI.exportRetraining({ verdicts: ["true_positive"] });
      const url = URL.createObjectURL(new Blob([data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `retraining_dataset_${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export failed", e);
    } finally {
      setExportLoading(false);
    }
  };

  const totalPages = Math.ceil(total / 25);

  return (
    <div style={p.root}>
      <div style={p.header}>
        <div>
          <h1 style={p.title}>Detection History</h1>
          <div style={p.sub}>{total} total records</div>
        </div>
        <button
          onClick={handleExport}
          disabled={exportLoading}
          style={p.exportBtn}
          title="Download YOLO-format training dataset from True Positives"
        >
          {exportLoading ? "Exporting…" : "⬇ Export Retraining Dataset"}
        </button>
      </div>

      <div style={p.tableWrap}>
        <table style={t.table}>
          <thead>
            <tr style={t.headerRow}>
              {["Timestamp", "Camera", "Confidence", "Detections", "Verdict", "Comment", "Latency"].map((h) => (
                <th key={h} style={t.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ ...t.cell, textAlign: "center", padding: 40, color: "#3a4a6a" }}>
                Loading…
              </td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} style={{ ...t.cell, textAlign: "center", padding: 40, color: "#3a4a6a" }}>
                No records found.
              </td></tr>
            ) : (
              items.map((item) => <TableRow key={item.id} item={item} />)
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={p.pagination}>
          <button onClick={() => setPage((x) => Math.max(1, x - 1))} disabled={page === 1} style={p.pageBtn}>← Prev</button>
          <span style={p.pageInfo}>Page {page} of {totalPages}</span>
          <button onClick={() => setPage((x) => Math.min(totalPages, x + 1))} disabled={page === totalPages} style={p.pageBtn}>Next →</button>
        </div>
      )}
    </div>
  );
}

const t = {
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  headerRow: { borderBottom: "1px solid #1e2942" },
  th: {
    padding: "10px 14px",
    textAlign: "left",
    fontSize: 9,
    color: "#3a4a6a",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    fontWeight: 700,
  },
  row: { borderBottom: "1px solid #111827", transition: "background 0.1s" },
  cell: { padding: "11px 14px", color: "#94a3b8", verticalAlign: "middle" },
  confChip: {
    padding: "3px 7px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
  },
  verdictChip: { fontSize: 11, fontWeight: 600 },
};

const p = {
  root: { padding: "32px 36px", fontFamily: "'DM Mono', monospace" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  title: { fontSize: 22, fontWeight: 700, color: "#e2e8f0", margin: 0 },
  sub: { fontSize: 11, color: "#3a4a6a", marginTop: 6 },
  exportBtn: {
    background: "#0d1a2e",
    border: "1px solid #1e3a5c",
    borderRadius: 6,
    padding: "10px 16px",
    fontSize: 11,
    fontWeight: 700,
    color: "#60a5fa",
    cursor: "pointer",
    fontFamily: "'DM Mono', monospace",
    letterSpacing: "0.06em",
  },
  tableWrap: {
    background: "#0d1321",
    border: "1px solid #1e2942",
    borderRadius: 8,
    overflow: "hidden",
  },
  pagination: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginTop: 24,
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
