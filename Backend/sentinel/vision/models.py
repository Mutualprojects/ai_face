"""Face / person model loading (InsightFace + YOLOv8).

Loaded once at startup; `face_app` and `yolo_app` are shared read-only
globals, exactly like the original single-file behaviour.
"""

from ..config import Config
from ..logging_setup import get_logger

log = get_logger("sentinel.vision.models")

face_app = None
ACTIVE_MODEL_NAME = None
yolo_app = None


def load_models():
    """Load InsightFace (preferring the fast CPU 'buffalo_sc') and YOLOv8n.
    Idempotent; safe to call again (returns the existing instances)."""
    global face_app, ACTIVE_MODEL_NAME, yolo_app
    if face_app is not None:
        return face_app, yolo_app

    log.info("Loading InsightFace model (preferring fast CPU-optimized 'buffalo_sc')...")
    from insightface.app import FaceAnalysis

    for model_name in ["buffalo_sc", "buffalo_l"]:
        try:
            candidate = FaceAnalysis(name=model_name, providers=["CPUExecutionProvider"])
            candidate.prepare(ctx_id=-1, det_size=(480, 480))
            face_app = candidate
            ACTIVE_MODEL_NAME = model_name
            log.info("InsightFace '%s' model loaded successfully.", model_name)
            break
        except Exception as e:
            log.warning("Could not load '%s': %s. Trying next model...", model_name, e)

    if face_app is None:
        log.error("No InsightFace model could be loaded.")

    log.info("Loading YOLOv8n model...")
    try:
        import torch
        try:
            import ultralytics.nn.tasks
            import torch.nn.modules.container
            torch.serialization.add_safe_globals([
                ultralytics.nn.tasks.DetectionModel,
                torch.nn.modules.container.Sequential
            ])
        except Exception:
            pass
        from ultralytics import YOLO
        yolo_app = YOLO(Config.YOLO_MODEL_PATH)
        log.info("YOLOv8n model loaded successfully.")
    except Exception as e:
        log.warning("Could not load YOLOv8n model: %s", e)
        yolo_app = None

    return face_app, yolo_app
