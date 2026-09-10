# CrackSentinel — Production Crack Detection System

AI-powered concrete crack monitoring with human verification workflow.

```
YOLO v8/v11 model → frame capture → inference → Slack/Email alerts → officer dashboard
```

---

## Quick Start

### Prerequisites
- Docker + Docker Compose
- Your trained `best.pt` YOLO model in the project root
- (Optional) GPU with CUDA for faster inference

```bash
# 1. Clone / unpack this project
cd crack-detection-system/

# 2. Copy the model
cp /path/to/best.pt ./best.pt

# 3. Configure environment
cp backend/.env.example .env
# Edit .env — at minimum set SECRET_KEY, and optionally Slack/Email

# 4. Launch
docker compose up --build -d

# 5. Access
# Dashboard: http://localhost
# API docs:  http://localhost:8000/api/docs  (dev mode only)
```

Default credentials: `admin / changeme` or `officer / inspect123`
> **Change these immediately** in `backend/app/utils/auth.py` or via a users table.

---

## Development Setup (without Docker)

### Backend

```bash
cd backend/

# Python 3.11+ required
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

pip install -r requirements.txt

# Copy and configure environment
cp .env.example .env
# Edit .env as needed

# Place best.pt in backend/ directory
cp /path/to/best.pt ./best.pt

# Run
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend/
npm install

# Copy env
echo "VITE_API_URL=http://localhost:8000/api/v1" > .env.local

npm run dev
# Runs on http://localhost:5173
```

---

## Project Structure

```
crack-detection-system/
├── backend/
│   ├── app/
│   │   ├── main.py              ← FastAPI app + lifespan startup/shutdown
│   │   ├── config.py            ← All settings from .env
│   │   ├── database.py          ← Async SQLAlchemy engine + session factory
│   │   ├── models/
│   │   │   ├── camera.py        ← Camera ORM model
│   │   │   ├── inference.py     ← InferenceRecord ORM model
│   │   │   ├── feedback.py      ← OfficerFeedback ORM model
│   │   │   └── notification.py  ← NotificationLog ORM model
│   │   ├── schemas/
│   │   │   └── __init__.py      ← All Pydantic request/response schemas
│   │   ├── services/
│   │   │   ├── capture.py       ← CameraWorker + CaptureManager
│   │   │   ├── inference.py     ← YOLOService (model wrapper + annotation)
│   │   │   ├── pipeline.py      ← ProcessingPipeline (queue + workers)
│   │   │   ├── notification.py  ← Slack + Email with cooldown
│   │   │   └── storage.py       ← Flagged image filesystem storage
│   │   ├── routers/
│   │   │   ├── auth.py          ← Login endpoint
│   │   │   ├── cameras.py       ← Camera CRUD + runtime control
│   │   │   ├── inferences.py    ← List/detail/image endpoints
│   │   │   ├── feedback.py      ← Officer verdict submission
│   │   │   └── stats.py         ← Dashboard stats + retraining export
│   │   └── utils/
│   │       └── auth.py          ← JWT creation/validation
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx              ← Router + protected routes
│   │   ├── main.jsx             ← React entry point
│   │   ├── index.css            ← Global styles
│   │   ├── api/client.js        ← Axios + JWT interceptors + API functions
│   │   ├── context/
│   │   │   └── AuthContext.jsx  ← Auth state + login/logout
│   │   ├── components/
│   │   │   ├── Layout.jsx       ← Sidebar navigation shell
│   │   │   └── FeedbackModal.jsx← Officer verdict modal
│   │   └── pages/
│   │       ├── Login.jsx        ← Authentication page
│   │       ├── Dashboard.jsx    ← Stats overview + recent alerts
│   │       ├── Queue.jsx        ← Pending verification cards
│   │       ├── History.jsx      ← All records + export
│   │       └── Cameras.jsx      ← Camera management
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   ├── nginx.conf
│   └── Dockerfile
├── docker-compose.yml
├── ARCHITECTURE.md
└── README.md
```

---

## API Reference

### Authentication
```
POST /api/v1/auth/login
Body: { "username": "admin", "password": "changeme" }
Response: { "access_token": "...", "expires_in": 3600 }
```

All other endpoints require: `Authorization: Bearer <token>`

### Cameras
```
GET    /api/v1/cameras              List all cameras
POST   /api/v1/cameras              Register new camera (admin)
GET    /api/v1/cameras/{id}         Get camera details
PATCH  /api/v1/cameras/{id}         Update camera settings (admin)
DELETE /api/v1/cameras/{id}         Delete camera (admin)
POST   /api/v1/cameras/{id}/restart Force reconnect worker (admin)
```

Camera body:
```json
{
  "name": "Entrance Column A",
  "stream_url": "rtsp://192.168.1.100/stream",
  "frame_interval_seconds": 5,
  "alert_threshold": 0.45,
  "is_active": true
}
```

### Inferences
```
GET /api/v1/inferences              List flagged detections (paginated)
    ?page=1&page_size=20
    ?camera_id=1
    ?verified=false                 (pending only)
    ?crack_only=true
GET /api/v1/inferences/{id}         Full detail + segmentation data
GET /api/v1/inferences/{id}/image   Annotated PNG image
```

### Feedback
```
POST /api/v1/feedback/{inference_id}   Submit officer verdict
PUT  /api/v1/feedback/{inference_id}   Update existing verdict
GET  /api/v1/feedback/{inference_id}   Get verdict for an inference

Body: { "verdict": "true_positive|false_positive|needs_inspection", "comment": "..." }
```

### Stats
```
GET /api/v1/stats                       Dashboard statistics
GET /api/v1/stats/export/retraining-dataset  ZIP export (admin)
    ?verdicts=true_positive
    ?start_date=2025-01-01T00:00:00Z
    ?end_date=2025-12-31T23:59:59Z
```

---

## Adding a Camera (IP Camera / Phone)

### Using your phone as IP camera

1. Install an IP camera app (e.g., **IP Webcam** on Android, **EpocCam** on iOS)
2. Start the server in the app — note the URL shown (e.g., `http://192.168.1.50:8080/video`)
3. In the dashboard, go to **Cameras → Add Camera**:
   - Stream URL: `http://192.168.1.50:8080/video` (HTTP MJPEG)
   - Or RTSP: `rtsp://192.168.1.50:8080/h264_ulaw.sdp`

### RTSP IP Camera example
```
rtsp://admin:password@192.168.1.100:554/stream
```

### Testing locally with a webcam
```
# Camera stream URL for webcam (OpenCV device index)
# Set stream_url to integer string "0" for default webcam — 
# Note: modify CameraWorker._open_capture() to handle integer URLs:
```
```python
# In services/capture.py, modify _open():
src = int(self.stream_url) if self.stream_url.isdigit() else self.stream_url
cap = cv2.VideoCapture(src)
```

---

## Configuration Reference

Key `.env` variables:

| Variable | Default | Description |
|---|---|---|
| `SECRET_KEY` | `changeme…` | **Change this** — JWT signing key |
| `DATABASE_URL` | SQLite | PostgreSQL recommended for production |
| `MODEL_PATH` | `best.pt` | Path to your YOLO weights file |
| `INFERENCE_DEVICE` | `cpu` | `cpu`, `cuda:0`, or `mps` |
| `INFERENCE_WORKERS` | `2` | Parallel inference coroutines |
| `DEFAULT_FRAME_INTERVAL_SECONDS` | `5` | Seconds between frames per camera |
| `DEFAULT_ALERT_THRESHOLD` | `0.45` | Min confidence to trigger alert (0–1) |
| `ALERT_COOLDOWN_SECONDS` | `120` | Suppress repeat alerts per camera (seconds) |
| `SLACK_ENABLED` | `false` | Enable Slack notifications |
| `SLACK_BOT_TOKEN` | — | `xoxb-…` from your Slack app |
| `EMAIL_ENABLED` | `false` | Enable email notifications |

---

## Deployment Guide

### Production Checklist

- [ ] Set a strong random `SECRET_KEY`: `openssl rand -hex 32`
- [ ] Switch to PostgreSQL: update `DATABASE_URL`
- [ ] Put `best.pt` in place before building
- [ ] Enable Slack and/or Email notifications
- [ ] Set `APP_ENV=production` (disables API docs)
- [ ] Put this behind HTTPS (Nginx + Let's Encrypt / Cloudflare)
- [ ] Back up the PostgreSQL volume and flagged images volume regularly
- [ ] Configure a log aggregator (Loki, CloudWatch, etc.)

### HTTPS with Nginx (production)

Add a second Nginx container or use Traefik as a reverse proxy:

```yaml
# Add to docker-compose.yml services:
  traefik:
    image: traefik:v3.2
    command:
      - --providers.docker=true
      - --entrypoints.web.address=:80
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.le.acme.httpchallenge=true
      - --certificatesresolvers.le.acme.email=you@example.com
      - --certificatesresolvers.le.acme.storage=/letsencrypt/acme.json
    ports: ["80:80", "443:443"]
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - letsencrypt:/letsencrypt
    networks: [app_net]
```

### GPU Inference

```yaml
# In docker-compose.yml backend service:
  backend:
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    environment:
      INFERENCE_DEVICE: cuda:0
```

```bash
# Change requirements.txt torch line to CUDA build:
# pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
```

### Scaling

**Multiple cameras**: Each camera runs its own asyncio task. A single instance 
with `INFERENCE_WORKERS=4` on a 4-core machine handles ~10–15 cameras comfortably 
at 5s intervals with CPU inference. GPU inference easily handles 50+ cameras.

**Horizontal scaling**: The capture + inference loop runs in a single process by 
design (shared model, shared queue). To distribute across machines, replace the 
in-process `asyncio.Queue` with a message broker (Redis Streams / RabbitMQ) and 
run capture workers and inference workers as separate services.

**Database**: Switch to PostgreSQL in production. The async SQLAlchemy setup 
supports connection pooling — set `pool_size` and `max_overflow` in `database.py`.

---

## Security Considerations

1. **JWT Secrets**: `SECRET_KEY` must be at least 32 random bytes. Use `openssl rand -hex 32`.

2. **User Management**: The current `USER_DB` dict is for demonstration only. 
   For production, add a `users` table with bcrypt password hashing via `passlib`:
   ```python
   from passlib.context import CryptContext
   pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
   ```

3. **Stream URL Security**: Camera stream URLs may contain credentials. Store them 
   in the DB (they're encrypted at rest if you enable PostgreSQL TDE) and never 
   expose them in API responses.

4. **Image Access**: Annotated images are served via authenticated API endpoints only.
   Do not mount the `data/flagged` volume as a static files directory.

5. **Network Isolation**: Keep the backend and database on an internal network.
   Only the frontend port (80/443) should be internet-facing.

6. **Rate Limiting**: Add `slowapi` rate limiting to login endpoint to prevent 
   brute-force attacks.

---

## Edge Cases & Failure Handling

### Camera Disconnects
- `CameraWorker` catches all errors in its capture loop.
- On failure, it marks the camera `offline` in DB, waits with exponential backoff 
  (1s → 2s → 4s → … up to 60s), then retries.
- After `CAMERA_RECONNECT_MAX_RETRIES` consecutive failures, the worker marks status 
  `error` and stops — preventing runaway retry loops.
- An admin can restart via `POST /api/v1/cameras/{id}/restart`.

### Model Not Found
- If `best.pt` is missing at startup, the system logs an error but continues running.
- Cameras will be registered, but frames will fail inference with logged errors.
- Replace the model file and restart the backend container.

### Inference Queue Overflow
- `INFERENCE_QUEUE_MAX=50` (default). If inference is slower than frame arrival, 
  excess frames are dropped (not buffered to disk).
- Logged as WARNING so you can tune worker count or frame interval.

### Alert Spam Prevention
- `ALERT_COOLDOWN_SECONDS` (default 120s) per camera: only one alert sent per 
  2-minute window regardless of how many cracks are detected.
- Can be tuned per deployment environment.

### Large Segmentation Polygons
- YOLO segmentation polygons are stored as compressed JSON text.
- Very complex cracks may produce large polygons; the frontend canvas renderer 
  handles them natively via `ctx.lineTo()` loops.

### Concurrent Feedback Submission
- `POST /feedback/{id}` returns `409 Conflict` if feedback already exists.
- Multiple officers can read the same record; only one can submit first.
- Use `PUT /feedback/{id}` to override an existing verdict.

---

## Retraining Workflow (Bonus)

The system accumulates ground-truth data from officer feedback:

1. Officers mark detections as `true_positive` over time.
2. Download the retraining dataset: `GET /api/v1/stats/export/retraining-dataset`
3. The ZIP contains:
   - `images/<frame_id>.png` — annotated detection images
   - `labels/<frame_id>.txt` — YOLO-format bounding box labels
   - `metadata/<frame_id>.json` — full inference + verdict metadata
4. Fine-tune your model:
   ```bash
   yolo train model=yolov8n-seg.pt data=custom_dataset.yaml epochs=50 imgsz=640
   ```
5. Replace `best.pt` and restart the backend.

> **Note**: The label files currently contain pixel-coordinate bboxes. 
> Before retraining, normalise them by dividing by image dimensions. 
> This is straightforward to automate with the image dimensions available 
> from OpenCV when the dataset is prepared.

---

## Health Monitoring

```bash
# Check system health
curl http://localhost:8000/health
# {"status":"ok","model_loaded":true,"env":"production"}

# Check database connectivity
docker compose exec db psql -U crackuser -d crackdb -c "SELECT COUNT(*) FROM inference_records;"

# View backend logs
docker compose logs -f backend

# View last 100 notification attempts
docker compose exec db psql -U crackuser -d crackdb \
  -c "SELECT channel, success, error_message, sent_at FROM notification_log ORDER BY sent_at DESC LIMIT 100;"
```
