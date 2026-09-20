"""
services/notification.py — Slack + Email notification service.

Features:
- Per-camera cooldown to prevent alert spam.
- Sends annotated image + structured metadata.
- Logs every send attempt to notification_log table.
- Gracefully handles partial failures (Slack fails → still tries Email).
"""
from __future__ import annotations

import asyncio
import logging
import smtplib
import ssl
from datetime import datetime, timezone, timedelta
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

from app.config import get_settings
from app.services.inference import InferenceResult
from app.services.storage import StorageService

logger = logging.getLogger(__name__)
settings = get_settings()


class CooldownTracker:
    """In-memory per-camera cooldown tracker (thread-safe via GIL for dict ops)."""

    def __init__(self, cooldown_seconds: int) -> None:
        self._cooldown = timedelta(seconds=cooldown_seconds)
        self._last_sent: dict[int, datetime] = {}

    def is_on_cooldown(self, camera_id: int) -> bool:
        last = self._last_sent.get(camera_id)
        if last is None:
            return False
        return datetime.now(timezone.utc) - last < self._cooldown

    def mark_sent(self, camera_id: int) -> None:
        self._last_sent[camera_id] = datetime.now(timezone.utc)


# Module-level singleton cooldown tracker
_cooldown = CooldownTracker(settings.ALERT_COOLDOWN_SECONDS)


class NotificationService:
    def __init__(self) -> None:
        self._storage = StorageService()

    async def dispatch(self, result: InferenceResult, db_factory) -> None:
        """Send notifications for a detected crack. Checks cooldown first."""
        camera_id = result.frame_meta.camera_id

        if _cooldown.is_on_cooldown(camera_id):
            logger.info(
                "Camera %d is on cooldown — suppressing notification for frame %s.",
                camera_id, result.frame_meta.frame_id,
            )
            return

        _cooldown.mark_sent(camera_id)

        # Load annotated image bytes (if available via path lookup)
        image_bytes = result.annotated_image_bytes  # already in memory from inference

        tasks = []
        if settings.SLACK_ENABLED:
            tasks.append(self._send_slack(result, image_bytes, db_factory))
        if settings.EMAIL_ENABLED and settings.ALERT_EMAIL_TO:
            tasks.append(self._send_email(result, image_bytes, db_factory))

        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    # ── Slack ──────────────────────────────────────────────────────────────────

    async def _send_slack(self, result: InferenceResult, image_bytes: bytes | None, db_factory) -> None:
        from slack_sdk.web.async_client import AsyncWebClient
        from app.models.notification import NotificationLog, NotificationChannel

        ts = result.frame_meta.captured_at.strftime("%Y-%m-%d %H:%M:%S UTC")
        dashboard_url = (
            f"{settings.DASHBOARD_BASE_URL}/queue?highlight={result.frame_meta.frame_id}"
        )

        blocks = [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": "🔴 Crack Detected"},
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Camera ID:* {result.frame_meta.camera_id}"},
                    {"type": "mrkdwn", "text": f"*Confidence:* {result.max_confidence:.1%}"},
                    {"type": "mrkdwn", "text": f"*Timestamp:* {ts}"},
                    {"type": "mrkdwn", "text": f"*Detections:* {result.num_detections}"},
                ],
            },
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "Verify in Dashboard"},
                        "url": dashboard_url,
                        "style": "danger",
                    }
                ],
            },
        ]

        success = False
        error_msg: str | None = None

        try:
            client = AsyncWebClient(token=settings.SLACK_BOT_TOKEN)

            # Send text message with blocks
            resp = await client.chat_postMessage(
                channel=settings.SLACK_CHANNEL,
                text=f"Crack detected on camera {result.frame_meta.camera_id} "
                     f"with {result.max_confidence:.1%} confidence",
                blocks=blocks,
            )

            # Upload annotated image as a file (if available)
            if image_bytes and resp.get("ok"):
                await client.files_upload_v2(
                    channel=settings.SLACK_CHANNEL,
                    filename=f"crack_{result.frame_meta.frame_id}.png",
                    content=image_bytes,
                    title=f"Annotated Frame — {ts}",
                )

            success = resp.get("ok", False)
            if not success:
                error_msg = str(resp.get("error", "unknown Slack error"))

        except Exception as exc:
            error_msg = str(exc)
            logger.exception("Slack notification failed for frame %s: %s",
                             result.frame_meta.frame_id, exc)

        await self._log_notification(
            result, "slack", settings.SLACK_CHANNEL, success, error_msg, db_factory
        )

    # ── Email ──────────────────────────────────────────────────────────────────

    async def _send_email(self, result: InferenceResult, image_bytes: bytes | None, db_factory) -> None:
        """Send email via SMTP in thread pool to avoid blocking event loop."""
        success, error_msg = await asyncio.to_thread(
            self._send_email_sync, result, image_bytes
        )
        for recipient in settings.ALERT_EMAIL_TO:
            await self._log_notification(
                result, "email", recipient, success, error_msg, db_factory
            )

    def _send_email_sync(
        self, result: InferenceResult, image_bytes: bytes | None
    ) -> tuple[bool, str | None]:
        ts = result.frame_meta.captured_at.strftime("%Y-%m-%d %H:%M:%S UTC")
        dashboard_url = (
            f"{settings.DASHBOARD_BASE_URL}/queue?highlight={result.frame_meta.frame_id}"
        )

        msg = MIMEMultipart("related")
        msg["Subject"] = (
            f"[CRACK ALERT] Camera {result.frame_meta.camera_id} — "
            f"Confidence {result.max_confidence:.1%} — {ts}"
        )
        msg["From"] = settings.ALERT_EMAIL_FROM
        msg["To"] = ", ".join(settings.ALERT_EMAIL_TO)

        html_body = f"""
        <html><body style="font-family: sans-serif; color: #222;">
          <h2 style="color: #c0392b;">🔴 Crack Detected</h2>
          <table>
            <tr><td><b>Camera ID:</b></td><td>{result.frame_meta.camera_id}</td></tr>
            <tr><td><b>Confidence:</b></td><td>{result.max_confidence:.1%}</td></tr>
            <tr><td><b>Detections:</b></td><td>{result.num_detections}</td></tr>
            <tr><td><b>Timestamp:</b></td><td>{ts}</td></tr>
            <tr><td><b>Latency:</b></td><td>{result.inference_latency_ms:.1f}ms</td></tr>
          </table>
          {"<br><img src='cid:annotated_frame' style='max-width:800px;border:2px solid #c0392b;'/>" if image_bytes else ""}
          <br>
          <a href="{dashboard_url}" style="background:#c0392b;color:#fff;padding:10px 20px;
             text-decoration:none;border-radius:4px;">
            Verify in Dashboard
          </a>
        </body></html>
        """

        alt_part = MIMEMultipart("alternative")
        alt_part.attach(MIMEText("Crack detected. See HTML version for details.", "plain"))
        alt_part.attach(MIMEText(html_body, "html"))
        msg.attach(alt_part)

        if image_bytes:
            img_part = MIMEImage(image_bytes, name="annotated_frame.png")
            img_part.add_header("Content-ID", "<annotated_frame>")
            img_part.add_header("Content-Disposition", "inline", filename="annotated_frame.png")
            msg.attach(img_part)

        try:
            if settings.SMTP_USE_TLS:
                context = ssl.create_default_context()
                with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                    server.ehlo()
                    server.starttls(context=context)
                    server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                    server.send_message(msg)
            else:
                with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                    server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                    server.send_message(msg)
            return True, None
        except Exception as exc:
            logger.exception("Email send failed: %s", exc)
            return False, str(exc)

    # ── Logging ────────────────────────────────────────────────────────────────

    async def _log_notification(
        self,
        result: InferenceResult,
        channel: str,
        recipient: str,
        success: bool,
        error_message: str | None,
        db_factory,
    ) -> None:
        if db_factory is None:
            return
        from app.models.notification import NotificationLog, NotificationChannel

        try:
            async with db_factory() as session:
                # Look up inference record id by frame_id
                from sqlalchemy import select
                from app.models.inference import InferenceRecord

                stmt = select(InferenceRecord).where(
                    InferenceRecord.frame_id == result.frame_meta.frame_id
                )
                rec = (await session.execute(stmt)).scalar_one_or_none()
                if rec is None:
                    logger.warning(
                        "Cannot log notification — InferenceRecord not found for frame %s",
                        result.frame_meta.frame_id,
                    )
                    return

                log = NotificationLog(
                    inference_record_id=rec.id,
                    channel=NotificationChannel(channel),
                    recipient=recipient,
                    success=success,
                    error_message=error_message,
                )
                session.add(log)
                await session.commit()
        except Exception as exc:
            logger.exception("Failed to log notification: %s", exc)
