"""OpenCV preprocessing helpers used across the pipeline."""

import base64

import cv2
import numpy as np

from .logger import get_logger

log = get_logger("sentinel.preprocess")


def base64_to_cv2(b64_str):
    try:
        if "," in b64_str:
            b64_str = b64_str.split(",")[1]
        nparr = np.frombuffer(base64.b64decode(b64_str), np.uint8)
        return cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    except Exception as e:
        log.error("base64 decode error: %s", e)
        return None


def cv2_to_base64(img, quality=90):
    try:
        _, buffer = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality])
        return "data:image/jpeg;base64," + base64.b64encode(buffer).decode("utf-8")
    except Exception as e:
        log.error("jpeg encode error: %s", e)
        return None


def enhance_face_for_embedding(face_img):
    """HD-quality preprocessing: upscale -> CLAHE -> bilateral -> unsharp mask."""
    if face_img is None or face_img.size == 0:
        return face_img
    try:
        h, w = face_img.shape[:2]
        if h < 112 or w < 112:
            scale = max(112.0 / h, 112.0 / w)
            face_img = cv2.resize(
                face_img,
                (max(w, int(w * scale)), max(h, int(h * scale))),
                interpolation=cv2.INTER_CUBIC,
            )
        lab = cv2.cvtColor(face_img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        l = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(l)
        face_img = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)
        face_img = cv2.bilateralFilter(face_img, 5, 35, 35)
        gaussian = cv2.GaussianBlur(face_img, (0, 0), 2.0)
        face_img = cv2.addWeighted(face_img, 1.5, gaussian, -0.5, 0)
    except Exception:
        pass
    return face_img


def pad_image(img, pad_size=50):
    return cv2.copyMakeBorder(
        img, pad_size, pad_size, pad_size, pad_size,
        cv2.BORDER_CONSTANT, value=[128, 128, 128],
    )
