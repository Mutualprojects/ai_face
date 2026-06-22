import sys
import os
from app import fetch_known_faces
import json

faces = fetch_known_faces()
if faces:
    emb_str = faces[0].get('embedding')
    emb_list = json.loads(emb_str)
    print(f"Parsed {len(emb_list)} floats. First float: {emb_list[0]}")
