"""
models/__init__.py — SQLAlchemy ORM models.
Re-export everything so `import app.models` populates Base.metadata.
"""
from app.models.camera import Camera, CameraStatus
from app.models.inference import InferenceRecord
from app.models.feedback import OfficerFeedback, FeedbackVerdict
from app.models.notification import NotificationLog
from app.models.user import User, UserRole
from app.models.pipeline import Pipeline

__all__ = [
    "Pipeline",
    "Camera",
    "CameraStatus",
    "InferenceRecord",
    "OfficerFeedback",
    "FeedbackVerdict",
    "NotificationLog",
    "User",
    "UserRole",
]
