// pages/PipelineLog.jsx — Pipeline and camera history
import { useCallback, useEffect, useState } from "react";
import { camerasAPI, inferencesAPI, pipelinesAPI } from "../api/client";

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
        {item.camera_name || `Camera #${item.camera_id}`}
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
          color: "var(--text-secondary)",
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
  const [pipelines, setPipelines] = useState([]);
  const [cameras, setCameras] = useState([]);

  const [selectedPipeline, setSelectedPipeline] = useState("");
  const [selectedCamera, setSelectedCamera] = useState("");

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);

  const [loadingPipelines, setLoadingPipelines] = useState(true);
  const [loadingCameras, setLoadingCameras] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [pipelineResponse, cameraResponse] =
          await Promise.all([
            pipelinesAPI.list(),
            camerasAPI.list(),
          ]);

        const pipelineData = pipelineResponse.data || [];
        const cameraData = cameraResponse.data || [];

        setPipelines(pipelineData);
        setCameras(cameraData);

        if (pipelineData.length > 0) {
          setSelectedPipeline(String(pipelineData[0].id));
        }
      } catch (error) {
        console.error("Failed to load pipeline data:", error);
      } finally {
        setLoadingPipelines(false);
        setLoadingCameras(false);
      }
    };

    loadData();
  }, []);

  const pipelineCameras = cameras.filter(
    (camera) =>
      String(camera.pipeline_id) === String(selectedPipeline)
  );

  useEffect(() => {
    setSelectedCamera("");
  }, [selectedPipeline]);

  const fetchHistory = useCallback(async () => {
    if (!selectedPipeline) {
      setItems([]);
      setTotal(0);
      return;
    }

    setLoadingHistory(true);

    try {
      const params = {
        page: 1,
        page_size: 100,
        pipeline_id: selectedPipeline,
        crack_only: true,
      };

      if (selectedCamera) {
        params.camera_id = selectedCamera;
      }

      const { data } = await inferencesAPI.list(params);

      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error("Failed to load pipeline history:", error);
      setItems([]);
      setTotal(0);
    } finally {
      setLoadingHistory(false);
    }
  }, [selectedPipeline, selectedCamera]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const selectedPipelineData = pipelines.find(
    (pipeline) =>
      String(pipeline.id) === String(selectedPipeline)
  );

  const selectedCameraData = cameras.find(
    (camera) =>
      String(camera.id) === String(selectedCamera)
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

        <div style={styles.selectGroup}>
          <select
            value={selectedPipeline}
            onChange={(e) =>
              setSelectedPipeline(e.target.value)
            }
            disabled={loadingPipelines}
            style={styles.select}
          >
            <option value="">
              Select Pipeline
            </option>

            {pipelines.map((pipeline) => (
              <option
                key={pipeline.id}
                value={pipeline.id}
              >
                {pipeline.name}
              </option>
            ))}
          </select>

          <select
            value={selectedCamera}
            onChange={(e) =>
              setSelectedCamera(e.target.value)
            }
            disabled={
              loadingCameras ||
              !selectedPipeline ||
              pipelineCameras.length === 0
            }
            style={styles.select}
          >
            <option value="">
              All Cameras
            </option>

            {pipelineCameras.map((camera) => (
              <option
                key={camera.id}
                value={camera.id}
              >
                {camera.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* SELECTED PIPELINE CARD */}
      {selectedPipelineData && (
        <div style={styles.pipelineCard}>
          <div>
            <div style={styles.label}>
              SELECTED PIPELINE
            </div>

            <div style={styles.pipelineName}>
              {selectedPipelineData.name}
            </div>

            <div style={styles.pipelineId}>
              PIPELINE ID #{selectedPipelineData.id}
            </div>

            {selectedCameraData && (
              <div style={styles.pipelineId}>
                CAMERA · {selectedCameraData.name}
              </div>
            )}
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
                Camera
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
                  colSpan={7}
                  style={styles.empty}
                >
                  Loading pipeline history…
                </td>
              </tr>
            ) : !selectedPipeline ? (
              <tr>
                <td
                  colSpan={7}
                  style={styles.empty}
                >
                  Select a pipeline to view its history.
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  style={styles.empty}
                >
                  No crack records found.
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

  selectGroup: {
    display: "flex",
    gap: 8,
  },

  select: {
    minWidth: 190,
    background: "var(--panel)",
    border: "1px solid var(--border-strong)",
    borderRadius: 6,
    padding: "10px 12px",
    color: "var(--text-secondary)",
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    outline: "none",
  },

  pipelineCard: {
    background: "var(--panel)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "18px 20px",
    marginBottom: 20,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },

  label: {
    fontSize: 9,
    color: "var(--text-muted)",
    letterSpacing: "0.12em",
    marginBottom: 5,
  },

  pipelineName: {
    fontSize: 16,
    fontWeight: 700,
    color: "var(--text)",
  },

  pipelineId: {
    fontSize: 10,
    color: "var(--text-muted)",
    marginTop: 4,
  },

  recordCount: {
    textAlign: "right",
  },

  count: {
    fontSize: 20,
    fontWeight: 700,
    color: "var(--navy)",
  },

  tableWrap: {
    background: "var(--panel)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
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
  },

  row: {
    borderBottom: "1px solid var(--border)",
  },

  cell: {
    padding: "11px 14px",
    color: "var(--text-secondary)",
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
    color: "var(--text-muted)",
  },

  empty: {
    padding: 40,
    textAlign: "center",
    color: "var(--text-muted)",
  },
};