"""
models/__init__.py — SQLAlchemy ORM models.
Re-export everything so `import app.models` populates Base.metadata.
"""
from app.models.camera import Camera, CameraStatus
from app.models.inference import InferenceRecord
from app.models.feedback import OfficerFeedback, FeedbackVerdict
from app.models.notification import NotificationLog

__all__ = [
    "Camera",
    "CameraStatus",
    "InferenceRecord",
    "OfficerFeedback",
    "FeedbackVerdict",
    "NotificationLog",
]
