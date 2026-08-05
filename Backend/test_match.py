import numpy as np

faces = [{"name": "test1"}]
matrix = np.array([[1, 0, 0]], dtype=np.float32)

class Snapshot:
    def __init__(self, f, m):
        self.faces = f
        self.matrix = m

snapshot = Snapshot(faces, matrix)

def match_embedding(input_emb, snapshot, threshold=0.35):
    input_vec = np.asarray(input_emb, dtype=np.float32)
    norm_in = np.linalg.norm(input_vec)
    vec = input_vec / norm_in
    sims = np.dot(snapshot.matrix, vec)
    best_idx = int(np.argmax(sims))
    best_score = float(sims[best_idx])
    if best_score >= threshold:
        return snapshot.faces[best_idx], best_score
    return None, best_score

input_emb = [0.55, 0.55, 0.55] # some vector that matches partially
best_known, best_score = match_embedding(input_emb, snapshot)
print("best_known:", best_known, "best_score:", best_score)
