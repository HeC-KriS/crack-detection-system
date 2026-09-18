import { useCallback, useEffect, useState } from "react";
import { camerasAPI, inferencesAPI } from "../api/client";

const VERDICT_MAP = {
  true_positive: {
    label: "Verified Crack",
    color: "#ef4444",
  },
  false_positive: {
    label: "False Positive",
    color: "#6b7280",
  },
  needs_inspection: {
    label: "Needs Inspection",
    color: "#f59e0b",
  },
};

function PipelineRow({ item }) {
  const verdict = item.feedback
    ? VERDICT_MAP[item.feedback.verdict]
    : null;

  return (
    <tr style={styles.row}>
      <td style={styles.cell}>
        {new Date(item.captured_at).toLocaleString()}
      </td>

      <td style={styles.cell}>
        <span
          style={{
            ...styles.confChip,
            color:
              item.max_confidence > 0.7
                ? "#ef4444"
                : "#f59e0b",
            background:
              item.max_confidence > 0.7
                ? "rgba(239,68,68,0.1)"
                : "rgba(245,158,11,0.1)",
          }}
        >
          {(item.max_confidence * 100).toFixed(1)}%
        </span>
      </td>

      <td style={styles.cell}>
        {item.num_detections}
      </td>

      <td style={styles.cell}>
        {verdict ? (
          <span
            style={{
              ...styles.verdictChip,
              color: verdict.color,
            }}
          >
            {verdict.label}
          </span>
        ) : (
          <span style={styles.pending}>
            Pending
          </span>
        )}
      </td>

      <td style={styles.cell}>
        {item.feedback?.officer_id || "—"}
      </td>

      <td
        style={{
          ...styles.cell,
          color: "#4a5a7a",
          maxWidth: 220,
        }}
      >
        {item.feedback?.comment
          ? item.feedback.comment.length > 60
            ? item.feedback.comment.slice(0, 60) + "…"
            : item.feedback.comment
          : "—"}
      </td>
    </tr>
  );
}

export default function PipelineLog() {
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState("");
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);

  const [loadingCameras, setLoadingCameras] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Load available pipelines/cameras
  useEffect(() => {
    const loadCameras = async () => {
      try {
        const { data } = await camerasAPI.list();
        setCameras(data || []);

        // Select the first pipeline/camera automatically
        if (data && data.length > 0) {
          setSelectedCamera(String(data[0].id));
        }
      } catch (error) {
        console.error("Failed to load cameras:", error);
      } finally {
        setLoadingCameras(false);
      }
    };

    loadCameras();
  }, []);

  // Load history whenever selected pipeline changes
  const fetchHistory = useCallback(async () => {
    if (!selectedCamera) {
      setItems([]);
      setTotal(0);
      return;
    }

    setLoadingHistory(true);

    try {
      const { data } = await inferencesAPI.list({
        page: 1,
        page_size: 100,
        camera_id: selectedCamera,
        crack_only: true,
      });

      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error("Failed to load pipeline history:", error);
      setItems([]);
      setTotal(0);
    } finally {
      setLoadingHistory(false);
    }
  }, [selectedCamera]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const selectedPipeline = cameras.find(
    (camera) => String(camera.id) === String(selectedCamera)
  );

  return (
    <div style={styles.root}>

      {/* HEADER */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>
            Pipeline Log
          </h1>

          <div style={styles.sub}>
            Pipeline history and verified crack records
          </div>
        </div>

        {/* PIPELINE SELECTOR */}
        <select
          value={selectedCamera}
          onChange={(e) =>
            setSelectedCamera(e.target.value)
          }
          disabled={loadingCameras}
          style={styles.select}
        >
          <option value="">
            Select Pipeline / Camera
          </option>

          {cameras.map((camera) => (
            <option
              key={camera.id}
              value={camera.id}
            >
              {camera.name}
            </option>
          ))}
        </select>
      </div>

      {/* SELECTED PIPELINE CARD */}
      {selectedPipeline && (
        <div style={styles.pipelineCard}>

          <div>
            <div style={styles.label}>
              SELECTED PIPELINE
            </div>

            <div style={styles.pipelineName}>
              {selectedPipeline.name}
            </div>

            <div style={styles.pipelineId}>
              CAMERA ID #{selectedPipeline.id}
            </div>
          </div>

          <div style={styles.recordCount}>
            <div style={styles.label}>
              RECORDED EVENTS
            </div>

            <div style={styles.count}>
              {total}
            </div>
          </div>

        </div>
      )}

      {/* HISTORY TABLE */}
      <div style={styles.tableWrap}>

        <table style={styles.table}>

          <thead>
            <tr style={styles.headerRow}>
              <th style={styles.th}>
                Detection Time
              </th>

              <th style={styles.th}>
                Confidence
              </th>

              <th style={styles.th}>
                Detections
              </th>

              <th style={styles.th}>
                Status
              </th>

              <th style={styles.th}>
                Verified By
              </th>

              <th style={styles.th}>
                Comment
              </th>
            </tr>
          </thead>

          <tbody>

            {loadingHistory ? (
              <tr>
                <td
                  colSpan={6}
                  style={styles.empty}
                >
                  Loading pipeline history…
                </td>
              </tr>

            ) : !selectedCamera ? (
              <tr>
                <td
                  colSpan={6}
                  style={styles.empty}
                >
                  Select a pipeline to view its history.
                </td>
              </tr>

            ) : items.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  style={styles.empty}
                >
                  No crack records found for this pipeline.
                </td>
              </tr>

            ) : (
              items.map((item) => (
                <PipelineRow
                  key={item.id}
                  item={item}
                />
              ))
            )}

          </tbody>

        </table>

      </div>

    </div>
  );
}

const styles = {
  root: {
    padding: "32px 36px",
    fontFamily: "'DM Mono', monospace",
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
    color: "#e2e8f0",
    margin: 0,
  },

  sub: {
    fontSize: 11,
    color: "#3a4a6a",
    marginTop: 6,
  },

  select: {
    minWidth: 230,
    background: "#0d1321",
    border: "1px solid #1e2942",
    borderRadius: 6,
    padding: "10px 12px",
    color: "#94a3b8",
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    outline: "none",
  },

  pipelineCard: {
    background: "#0d1321",
    border: "1px solid #1e2942",
    borderRadius: 8,
    padding: "18px 20px",
    marginBottom: 20,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },

  label: {
    fontSize: 9,
    color: "#3a4a6a",
    letterSpacing: "0.12em",
    marginBottom: 5,
  },

  pipelineName: {
    fontSize: 16,
    fontWeight: 700,
    color: "#e2e8f0",
  },

  pipelineId: {
    fontSize: 10,
    color: "#4a5a7a",
    marginTop: 4,
  },

  recordCount: {
    textAlign: "right",
  },

  count: {
    fontSize: 20,
    fontWeight: 700,
    color: "#60a5fa",
  },

  tableWrap: {
    background: "#0d1321",
    border: "1px solid #1e2942",
    borderRadius: 8,
    overflow: "hidden",
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 12,
  },

  headerRow: {
    borderBottom: "1px solid #1e2942",
  },

  th: {
    padding: "10px 14px",
    textAlign: "left",
    fontSize: 9,
    color: "#3a4a6a",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    fontWeight: 700,
  },

  row: {
    borderBottom: "1px solid #111827",
  },

  cell: {
    padding: "11px 14px",
    color: "#94a3b8",
    verticalAlign: "middle",
  },

  confChip: {
    padding: "3px 7px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 700,
  },

  verdictChip: {
    fontSize: 11,
    fontWeight: 600,
  },

  pending: {
    fontSize: 11,
    color: "#4a5a7a",
  },

  empty: {
    padding: 40,
    textAlign: "center",
    color: "#3a4a6a",
  },
};