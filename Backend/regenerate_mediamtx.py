import os
import yaml
import re
import subprocess
from urllib.parse import unquote

MEDIAMTX_YAML = "/home/btl/facial_recognistion/Backend/mediamtx.yml"

def detect_codec_and_width(rtsp_url: str) -> tuple:
    decoded_url = unquote(rtsp_url)
    codec = "unknown"
    width = None
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-rtsp_transport", "tcp",
             "-i", decoded_url, "-select_streams", "v:0",
             "-show_entries", "stream=codec_name,width", "-of", "default=noprint_wrappers=1"],
            capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.strip().split("\n"):
            if "=" in line:
                key, val = line.split("=", 1)
                if key.strip() == "codec_name":
                    codec = val.strip().lower()
                elif key.strip() == "width":
                    try:
                        width = int(val.strip())
                    except ValueError:
                        pass
        return codec, width
    except Exception as e:
        print(f"ffprobe failed for {decoded_url}: {e}")
        return "unknown", None

def build_mediamtx_src(rtsp_url: str) -> dict:
    decoded_url = unquote(rtsp_url)
    if "$" in decoded_url:
        decoded_url = decoded_url.replace("$", "%24")
    
    # We assume HEVC for most of the cameras since they were transcoding before
    codec, width = detect_codec_and_width(decoded_url)
    if codec == "unknown":
        codec = "hevc" # Fallback assumption if ffprobe times out
        width = 1920

    if codec in ("hevc", "h265"):
        print(f"HEVC detected for {decoded_url} — will use high-quality ffmpeg transcode via runOnDemand")
        vf_scale = ""
        if width and width > 1280:
            vf_scale = "-vf scale=1280:-2 "
            print(f"Adding downscale filter (1280x720) for stream width {width}")
        
        return {
            "source": "publisher",
            "runOnDemand": f"ffmpeg -hide_banner -avoid_negative_ts make_zero -fflags nobuffer+discardcorrupt -flags low_delay -rtsp_transport tcp -i '{decoded_url}' {vf_scale}-c:v libx264 -preset ultrafast -tune zerolatency -crf 20 -pix_fmt yuv420p -g 30 -keyint_min 30 -sc_threshold 0 -an -f rtsp rtsp://localhost:$RTSP_PORT/$MTX_PATH",
            "runOnDemandRestart": True,
            "runOnDemandCloseAfter": "10s"
        }
    return {"source": decoded_url}

def main():
    print("Regenerating mediamtx.yml with high quality, downscaling, and on-demand configuration...")
    with open(MEDIAMTX_YAML, "r") as f:
        cfg = yaml.safe_load(f) or {}

    paths = cfg.get("paths", {})
    if not paths:
        print("No paths found")
        return

    camera_urls = {}
    for cam_id, info in paths.items():
        if not isinstance(info, dict):
            continue

        rtsp_url = ""
        if "source" in info and info["source"] != "publisher":
            rtsp_url = info["source"]
        elif "runOnInit" in info:
            match = re.search(r'-i\s+[\'"]?(rtsp://[^\s\'"]+)[\'"]?', info["runOnInit"])
            if match:
                rtsp_url = match.group(1)

        if rtsp_url:
            camera_urls[cam_id] = unquote(rtsp_url)

    for cam_id, rtsp_url in camera_urls.items():
        print(f"\nProcessing {cam_id}: {rtsp_url}")
        new_cfg = build_mediamtx_src(rtsp_url)
        cfg["paths"][cam_id] = new_cfg
        
    with open(MEDIAMTX_YAML, "w") as f:
        yaml.dump(cfg, f, default_flow_style=False, allow_unicode=True)

    print("\nRegeneration completed.")

if __name__ == "__main__":
    main()
