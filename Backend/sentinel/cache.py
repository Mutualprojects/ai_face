"""Atomic in-RAM embedding cache with vectorized cosine matching.

The cache holds an immutable (faces, normalized-matrix) snapshot so a
best-match index computed from one array can never alias into a newer one.
"""

import threading

import numpy as np

from . import database
from .config import Config
from .logger import get_logger

log = get_logger("sentinel.cache")


class CacheSnapshot:
    __slots__ = ("faces", "matrix")

    def __init__(self, faces, matrix):
        self.faces = faces
        self.matrix = matrix


EMPTY = CacheSnapshot([], None)
_snapshot = EMPTY
_lock = threading.Lock()


def get_snapshot():
    with _lock:
        return _snapshot


def refresh():
    global _snapshot
    try:
        all_faces = database.fetch_known_faces() + database.fetch_visitors()
        rows = []
        valid = []
        for item in all_faces:
            emb = database.parse_embedding(item.get("embedding"))
            if emb is None:
                continue
            norm = float(np.linalg.norm(emb))
            if norm == 0:
                continue
            rows.append(emb / norm)
            valid.append(item)

        matrix = np.vstack(rows) if rows else None
        with _lock:
            _snapshot = CacheSnapshot(valid, matrix)
        from .models import active_model
        log.info("Cache refreshed: %d face(s) in RAM matrix (model=%s).", len(valid), active_model)
    except Exception as e:
        log.error("Cache refresh error: %s", e)


def match(input_embedding, threshold=None, margin=None, top_n: int = 3):
    """Vectorized cosine match with margin-based rejection.

    Returns (best_face_or_None, best_score, runner_up_score, top_candidates)
    where top_candidates is a list of up to `top_n` {name, score, photo_url}
    dicts ranked by similarity (the "closest identities" comparison data).
    """
    threshold = Config.MATCH_THRESHOLD if threshold is None else threshold
    margin = Config.MATCH_MARGIN if margin is None else margin
    snapshot = get_snapshot()
    if not snapshot.faces or snapshot.matrix is None or len(snapshot.matrix) == 0:
        return None, -1.0, -1.0, []

    vec = np.asarray(input_embedding, dtype=np.float32)
    if snapshot.matrix.shape[1] != vec.shape[0]:
        log.warning(
            "Embedding dimension mismatch (cache=%d, input=%d).",
            snapshot.matrix.shape[1], vec.shape[0],
        )
        return None, -1.0, -1.0, []

    norm = float(np.linalg.norm(vec))
    if norm == 0:
        return None, -1.0, -1.0, []
    vec = vec / norm

    sims = np.dot(snapshot.matrix, vec)
    if len(sims) == 1:
        best_idx, best_score, runner_up = 0, float(sims[0]), -1.0
    else:
        top2 = np.argpartition(sims, -2)[-2:]
        top2 = top2[np.argsort(-sims[top2])]
        best_idx = int(top2[0])
        best_score = float(sims[best_idx])
        runner_up = float(sims[int(top2[1])])

    n = min(top_n, len(sims))
    top_idx = np.argpartition(sims, -n)[-n:] if n > 1 else np.array([best_idx])
    top_idx = top_idx[np.argsort(-sims[top_idx])]
    top_candidates = [
        {
            "name": snapshot.faces[int(i)]["name"],
            "score": round(float(sims[int(i)]), 4),
            "photo_url": snapshot.faces[int(i)].get("photo_url"),
        }
        for i in top_idx
    ]

    if best_score >= threshold and (best_score - runner_up) >= margin:
        return snapshot.faces[best_idx], best_score, runner_up, top_candidates
    return None, best_score, runner_up, top_candidates
