// pages/CrackLog.jsx — Overall verified crack history
import { useCallback, useEffect, useState } from "react";
import { inferencesAPI } from "../api/client";

export default function CrackLog() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchCracks = useCallback(async () => {
    setLoading(true);

    try {
      const { data } = await inferencesAPI.list({
        page: 1,
        page_size: 100,
        crack_only: true,
      });

      // Only verified cracks belong in the permanent Crack Log.
      const verifiedCracks = (data.items || []).filter(
        (item) => item.feedback?.verdict === "true_positive"
      );

      setItems(verifiedCracks);
    } catch (error) {
      console.error("Failed to load crack log:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCracks();
  }, [fetchCracks]);

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Crack Log</h1>
          <div style={styles.sub}>
            {items.length} verified crack{items.length !== 1 ? "s" : ""}
          </div>
        </div>

        <button onClick={fetchCracks} style={styles.refreshBtn}>
          ↻ Refresh
        </button>
      </div>

      {/* Table */}
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.headerRow}>
              <th style={styles.th}>Detection Time</th>
              <th style={styles.th}>Pipeline / Camera</th>
              <th style={styles.th}>Confidence</th>
              <th style={styles.th}>Detections</th>
              <th style={styles.th}>Verified By</th>
              <th style={styles.th}>Verified At</th>
              <th style={styles.th}>Comment</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    ...styles.cell,
                    textAlign: "center",
                    padding: 40,
                    color: "#3a4a6a",
                  }}
                >
                  Loading crack log…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    ...styles.cell,
                    textAlign: "center",
                    padding: 40,
                    color: "#3a4a6a",
                  }}
                >
                  No verified cracks found.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <TableRow key={item.id} item={item} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TableRow({ item }) {
  const feedback = item.feedback;

  return (
    <tr style={styles.row}>
      {/* Detection time */}
      <td style={styles.cell}>
        {item.captured_at
          ? new Date(item.captured_at).toLocaleString()
          : "—"}
      </td>

      {/* Pipeline / Camera */}
      <td style={styles.cell}>
        {item.pipeline_name && (
          <div style={styles.pipeline}>
            {item.pipeline_name}
          </div>
        )}

        <div>
          <span style={styles.camera}>
            CAM {item.camera_id}
          </span>

          {item.camera_name && (
            <span style={styles.cameraName}>
              {" · " + item.camera_name}
            </span>
          )}
        </div>
      </td>

      {/* Confidence */}
      <td style={styles.cell}>
        {typeof item.max_confidence === "number"
          ? (
              <span style={styles.confidence}>
                {(item.max_confidence * 100).toFixed(1)}%
              </span>
            )
          : "—"}
      </td>

      {/* Number of detections */}
      <td style={styles.cell}>
        {item.num_detections ?? "—"}
      </td>

      {/* Verified by */}
      <td style={styles.cell}>
        {feedback?.officer_id
          ? `Officer ${feedback.officer_id}`
          : "—"}
      </td>

      {/* Verification time */}
      <td style={styles.cell}>
        {feedback?.submitted_at
          ? new Date(feedback.submitted_at).toLocaleString()
          : "—"}
      </td>

      {/* Comment */}
      <td
        style={{
          ...styles.cell,
          color: "#4a5a7a",
          maxWidth: 220,
        }}
      >
        {feedback?.comment ? (
          <span title={feedback.comment}>
            {feedback.comment.length > 60
              ? feedback.comment.slice(0, 60) + "…"
              : feedback.comment}
          </span>
        ) : (
          "—"
        )}
      </td>
    </tr>
  );
}

const styles = {
  root: {
    padding: "32px 36px",
    fontFamily: "'DM Mono', monospace",
    color: "var(--text)",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
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

  refreshBtn: {
    background: "var(--panel)",
    border: "1px solid var(--border-strong)",
    borderRadius: 6,
    padding: "10px 16px",
    fontSize: 11,
    fontWeight: 700,
    color: "var(--navy)",
    cursor: "pointer",
    fontFamily: "'DM Mono', monospace",
  },

  tableWrap: {
    background: "var(--panel)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "auto",
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 12,
  },

  headerRow: {
    borderBottom: "1px solid var(--border)",
  },

  th: {
    padding: "10px 14px",
    textAlign: "left",
    fontSize: 9,
    color: "var(--text-muted)",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    fontWeight: 700,
    whiteSpace: "nowrap",
  },

  row: {
    borderBottom: "1px solid var(--border)",
  },

  cell: {
    padding: "12px 14px",
    color: "var(--text-secondary)",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
  },

  camera: {
    color: "var(--text)",
    fontWeight: 600,
  },

  cameraName: {
    color: "var(--text-muted)",
  },

  confidence: {
    color: "var(--red)",
    background: "rgba(163, 69, 58, 0.1)",
    padding: "3px 7px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 700,
  },

  pipeline: {
    color: "var(--text)",
    fontWeight: 700,
    marginBottom: 3,
  },
};