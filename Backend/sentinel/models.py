"""Model loaders: InsightFace (face detection + embeddings) and YOLOv8 (person boxes).

Loaded once at startup; `face_app` and `yolo_app` are shared read-only globals.
"""

from .config import Config
from .logger import get_logger

log = get_logger("sentinel.models")

face_app = None
active_model = None
yolo_app = None


def load_models():
    global face_app, active_model, yolo_app

    from insightface.app import FaceAnalysis

    for model_name in ["buffalo_sc", "buffalo_l"]:
        try:
            candidate = FaceAnalysis(name=model_name, providers=["CPUExecutionProvider"])
            candidate.prepare(ctx_id=-1, det_size=(480, 480))
            face_app = candidate
            active_model = model_name
            log.info("InsightFace '%s' model loaded.", model_name)
            break
        except Exception as e:
            log.warning("Could not load '%s': %s", model_name, e)

    if face_app is None:
        log.error("No InsightFace model could be loaded.")

    if Config.YOLO_ENABLED:
        try:
            import torch

            try:
                import torch.nn.modules.container
                import ultralytics.nn.tasks

                torch.serialization.add_safe_globals(
                    [ultralytics.nn.tasks.DetectionModel, torch.nn.modules.container.Sequential]
                )
            except Exception:
                pass
            from ultralytics import YOLO

            yolo_app = YOLO(Config.YOLO_MODEL_PATH)
            log.info("YOLOv8 model loaded from %s", Config.YOLO_MODEL_PATH)
        except Exception as e:
            log.warning("Could not load YOLOv8 model (face-only mode): %s", e)

    return face_app, yolo_app
