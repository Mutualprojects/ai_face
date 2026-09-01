"""Small shared helpers: image codecs, cosine similarity, photo loading."""

import base64

import cv2
import numpy as np
import requests

from .logging_setup import get_logger

log = get_logger("sentinel.utils")


def base64_to_cv2(b64_str):
    try:
        if "," in b64_str:
            b64_str = b64_str.split(",")[1]
        img_data = base64.b64decode(b64_str)
        nparr = np.frombuffer(img_data, np.uint8)
        return cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    except Exception as e:
        log.error("Error decoding base64 image: %s", e)
        return None


def cv2_to_base64(img):
    try:
        _, buffer = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 95])
        b64_bytes = base64.b64encode(buffer)
        return "data:image/jpeg;base64," + b64_bytes.decode('utf-8')
    except Exception as e:
        log.error("Error encoding image to base64: %s", e)
        return None


def cosine_similarity(a, b):
    a = np.asarray(a, dtype=np.float32)
    b = np.asarray(b, dtype=np.float32)
    dot = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot / (norm_a * norm_b))


def img_from_photo_url(photo_url: str):
    """Handles BOTH base64 data URLs and http(s) Supabase Storage URLs."""
    if not photo_url:
        return None
    if photo_url.startswith(("http://", "https://")):
        try:
            resp = requests.get(photo_url, timeout=10)
            if resp.status_code == 200:
                nparr = np.frombuffer(resp.content, np.uint8)
                return cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            log.warning("[img_from_photo_url] HTTP %s for %s", resp.status_code, photo_url[:60])
        except Exception as e:
            log.warning("[img_from_photo_url] Fetch failed: %s", e)
        return None
    return base64_to_cv2(photo_url)
