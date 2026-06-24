import sys
import os
import yaml
import re
from urllib.parse import unquote

sys.path.append("/home/btl/facial_recognistion/Backend")
from app import build_mediamtx_src, write_mediamtx_yaml_entry

with open("/home/btl/facial_recognistion/Backend/go2rtc.yaml", "r") as f:
    go2rtc = yaml.safe_load(f)

for cam_id, src in go2rtc.get("streams", {}).items():
    src_str = src[0] if isinstance(src, list) else str(src)
    rtsp_url = ""
    match = re.search(r'-i\s+[\'"]?(rtsp://[^\s\'"]+)[\'"]?', src_str)
    if match:
        rtsp_url = unquote(match.group(1))
    elif src_str.startswith("rtsp://"):
        rtsp_url = unquote(src_str)
        
    if rtsp_url:
        print(f"Migrating {cam_id}: {rtsp_url}")
        cfg = build_mediamtx_src(rtsp_url)
        write_mediamtx_yaml_entry(cam_id, cfg)
