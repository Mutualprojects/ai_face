"""In-RAM face embedding cache with vectorized cosine matching.

Holds an atomic immutable (faces, normalized-matrix) snapshot so a best_idx
computed from one array can never alias into a newer one. The refresh swap
is the only mutation, guarded by a lock.
"""

import json
import threading

import numpy as np

from . import repositories
from .config import Config
from .logging_setup import get_logger

log = get_logger("sentinel.cache")


class CacheSnapshot:
    __slots__ = ("faces", "matrix")

    def __init__(self, faces, matrix):
        self.faces = faces
        self.matrix = matrix


EMPTY_SNAPSHOT = CacheSnapshot([], None)
_snapshot = EMPTY_SNAPSHOT
_snapshot_lock = threading.Lock()


def get_cache_snapshot() -> CacheSnapshot:
    with _snapshot_lock:
        return _snapshot


def match_embedding(input_emb, snapshot: CacheSnapshot = None, threshold=None, margin=None, top_n: int = 3):
    """Vectorized cosine similarity match against the atomic cache snapshot,
    with margin-based rejection.

    Rather than accepting the single best match the moment it clears the
    threshold, we also require it to beat the *second-best* candidate by
    `margin`. A close runner-up means the embedding sits ambiguously
    between two identities (siblings/look-alikes or noisy crops) and should
    be reported as a non-match. Set margin=0 to fall back to pure
    threshold-only behaviour.

    Returns (best_face_or_None, best_score, runner_up_score, top_candidates).
    """
    if threshold is None:
        threshold = Config.MATCH_THRESHOLD
    if margin is None:
        margin = Config.MATCH_MARGIN
    if snapshot is None:
        snapshot = get_cache_snapshot()

    if not snapshot.faces or snapshot.matrix is None or len(snapshot.matrix) == 0:
        return None, -1.0, -1.0, []

    input_vec = np.asarray(input_emb, dtype=np.float32)
    if snapshot.matrix.shape[1] != input_vec.shape[0]:
        log.warning(
            "[match_embedding] Dimension mismatch: cache=%s-d, input=%s-d. "
            "Likely a stale model/embedding mismatch — run /api/refresh_cache "
            "after confirming embeddings are regenerated.",
            snapshot.matrix.shape[1], input_vec.shape[0],
        )
        return None, -1.0, -1.0, []

    norm_in = np.linalg.norm(input_vec)
    if norm_in == 0:
        return None, -1.0, -1.0, []
    vec = input_vec / norm_in

    sims = np.dot(snapshot.matrix, vec)
    if len(sims) == 1:
        best_idx = 0
        best_score = float(sims[0])
        runner_up = -1.0
    else:
        top2_idx = np.argpartition(sims, -2)[-2:]
        top2_idx = top2_idx[np.argsort(-sims[top2_idx])]
        best_idx = int(top2_idx[0])
        best_score = float(sims[best_idx])
        runner_up = float(sims[int(top2_idx[1])])

    # Top-N candidates for the comparison view (always computed so the UI
    # can show exactly which enrolled identities a face is closest to).
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


def refresh_cache():
    """Reload all known face embeddings, build the normalized matrix, and
    swap it in as ONE atomic snapshot."""
    global _snapshot
    try:
        faces = repositories.faces.fetch_known_faces()
        for f in faces:
            f["is_visitor"] = False

        visitors = repositories.faces.fetch_visitors()
        all_faces = faces + visitors

        matrix_rows = []
        valid_faces = []
        for item in all_faces:
            emb_val = item.get("embedding")
            if not emb_val:
                continue
            try:
                if isinstance(emb_val, str):
                    emb_arr = np.array(json.loads(emb_val), dtype=np.float32)
                else:
                    emb_arr = np.array(emb_val, dtype=np.float32)
            except Exception as parse_err:
                log.warning("[Cache] Skipping unparsable embedding for '%s': %s",
                            item.get('name'), parse_err)
                continue

            norm = np.linalg.norm(emb_arr)
            if norm == 0:
                continue
            matrix_rows.append(emb_arr / norm)
            valid_faces.append(item)

        matrix = np.vstack(matrix_rows) if matrix_rows else None
        new_snapshot = CacheSnapshot(valid_faces, matrix)

        with _snapshot_lock:
            _snapshot = new_snapshot

        log.info(
            "[Cache] Loaded %d face(s) into RAM matrix (%d known faces, %d visitors fetched; "
            "%d skipped — no/invalid embedding).",
            len(valid_faces), len(faces), len(visitors),
            len(faces) + len(visitors) - len(valid_faces),
        )
        return new_snapshot
    except Exception as e:
        log.error("Error refreshing cache: %s", e)
        return None
