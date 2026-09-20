# Crack Detection System — Architecture

## High-Level Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL SOURCES                                  │
│   [IP Camera 1]   [IP Camera 2]   [IP Camera N]   (RTSP / HTTP streams) │
└──────────────┬──────────────────────────────────────────────────────────┘
               │  frame every N seconds (configurable, default 5s)
               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│               FRAME CAPTURE SERVICE  (async, per-camera loop)            │
│  - OpenCV VideoCapture from stream URL                                   │
│  - Generates unique frame_id (uuid4) + UTC timestamp                     │
│  - Pushes raw frame bytes to inference queue                             │
│  - Raw frame NEVER written to disk                                       │
└──────────────────────────┬───────────────────────────────────────────────┘
                           │  asyncio.Queue (in-process)
                           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                  ML INFERENCE SERVICE                                     │
│  - Loads best.pt once at startup (ultralytics YOLO)                     │
│  - Runs detection + segmentation on each frame                           │
│  - Produces:                                                             │
│      • annotated_image (PNG bytes, bounding boxes + mask overlay)        │
│      • InferenceResult JSON: timestamp, camera_id, crack_detected,       │
│        confidence[], segmentation_meta, latency_ms                       │
│  - If crack_detected AND confidence > ALERT_THRESHOLD:                   │
│      → saves annotated_image to /data/flagged/<date>/<frame_id>.png      │
│      → writes InferenceRecord to DB                                      │
│      → pushes to notification queue                                      │
│  - Otherwise: frame discarded entirely                                   │
└──────────────────────────┬───────────────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
┌─────────────────────┐     ┌─────────────────────────────────────────────┐
│  NOTIFICATION SVC   │     │               POSTGRESQL DATABASE            │
│  - Slack (bot API)  │     │  Tables:                                    │
│  - Email (SMTP)     │     │    cameras          – registered cameras     │
│  - Rate-limited     │     │    inference_records – per-frame results     │
│    (1 alert per     │     │    officer_feedback  – human verdicts        │
│    camera per       │     │    notification_log  – sent alerts           │
│    COOLDOWN window) │     └─────────────────────────────────────────────┘
└─────────────────────┘                      ▲
                                             │  read/write
┌──────────────────────────────────────────────────────────────────────────┐
│                      FASTAPI BACKEND                                      │
│  Routers:                                                                │
│    /auth          – login, token refresh (JWT)                           │
│    /cameras       – CRUD for camera registrations                        │
│    /inferences    – list flagged, get detail, get annotated image        │
│    /feedback      – submit officer verdict + comment                     │
│    /stats         – aggregate stats for dashboard summary                │
│    /health        – liveness + readiness probe                           │
└──────────────────────────────────────────────────────────────────────────┘
               │  REST/JSON + JWT bearer token
               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     REACT DASHBOARD (Vite SPA)                           │
│  Pages:                                                                  │
│    /login         – JWT authentication                                   │
│    /dashboard     – live stats, camera feed status, recent alerts        │
│    /queue         – pending verification cards (flagged images)          │
│    /history       – all reviewed records with filters                    │
│  Components:                                                             │
│    CrackOverlay   – canvas-based segmentation mask renderer              │
│    FeedbackModal  – TP / FP / Needs Inspection + comment                │
│    CameraStatus   – per-camera heartbeat indicator                       │
└──────────────────────────────────────────────────────────────────────────┘
```

## Data Flow (Step-by-Step)

1. **Capture**: `CaptureService` runs one asyncio task per registered camera.
   Each task calls OpenCV every `camera.frame_interval_seconds`, reads one frame,
   attaches a UUID + UTC timestamp, and puts it on an in-process `asyncio.Queue`.

2. **Inference**: `InferenceWorker` consumes from the queue (N workers, configurable).
   It calls `YOLOService.infer(frame_bytes, frame_meta)`, which:
   - Decodes bytes → numpy array
   - Runs `model.predict()` with `task=segment` (or `task=detect` fallback)
   - Extracts boxes, confidences, class names, masks
   - Draws annotated overlay onto a copy of the frame
   - Returns `InferenceResult` dataclass

3. **Routing**: If `result.max_confidence >= camera.alert_threshold`:
   - Saves annotated PNG to filesystem (flagged images only)
   - Inserts `InferenceRecord` row to DB
   - Pushes to `NotificationQueue`
   - Otherwise: memory is freed, nothing persisted

4. **Notification**: `NotificationService` dequeues, checks cooldown per camera,
   sends Slack message + Email if cooldown not active, logs to `notification_log`.

5. **Verification**: Officer opens `/queue`, reviews cards, submits feedback.
   Frontend calls `POST /feedback/{inference_id}`. Backend writes `OfficerFeedback`
   row and links it back to `InferenceRecord`.

6. **Retraining Loop** (bonus): Feedback records tagged TP/FP can be exported via
   `GET /export/retraining-dataset` → returns YOLO-format annotation zip.

## Key Design Principles

- **No raw video stored** — frames are held only in RAM during processing.
- **Stateless workers** — inference workers share one loaded model (process-level singleton).
- **Cooldown per camera** — prevents alert spam (Redis or in-memory TTL dict).
- **Graceful degradation** — if camera disconnects, worker retries with exponential backoff,
  marks camera `status=offline`, continues other cameras unaffected.
- **Configurable thresholds** — per-camera `alert_threshold` overrides global default.
