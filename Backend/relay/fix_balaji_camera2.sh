#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Fix camera 2 (checkin) on Balaji's go2rtc relay.
# Run ON BALAJI as btl:
#   bash fix_balaji_camera2.sh
# ─────────────────────────────────────────────────────────────
set -euo pipefail

echo "==> 0/5 Check go2rtc is running ..."
if ! pgrep -x go2rtc >/dev/null 2>&1; then
  echo "    go2rtc NOT running — starting it"
  sudo systemctl start go2rtc 2>/dev/null || sudo systemctl restart go2rtc 2>/dev/null || true
  sleep 2
fi
pgrep -x go2rtc && echo "    go2rtc running ✓" || echo "    !! go2rtc not started"

echo "==> 1/5 Check go2rtc API (:1984) ..."
if curl -s -m 3 http://127.0.0.1:1984/api/streams >/dev/null 2>&1; then
  echo "    API up on :1984 ✓"
else
  echo "    API down — adding api listen to config and restarting"
  sudo mkdir -p /opt/rtsp-relay
  sudo tee /opt/rtsp-relay/go2rtc.yaml >/dev/null <<'YAML'
api:
  listen: ":1984"
rtsp:
  listen: ":8554"
webrtc:
  listen: ":8555/tcp"
log:
  level: info
streams:
  "11": rtsp://admin:admin@172.23.0.79:554/rtsp/streaming?channel=01&subtype=0
  "2":  rtsp://admin:admin@183.82.117.36:554/unicast/c17/s0
YAML
  sudo systemctl restart go2rtc
  sleep 2
fi

echo "==> 2/5 Register camera 11 upstream ..."
curl -s -X PUT "http://127.0.0.1:1984/api/streams/11?src=rtsp://admin:admin@172.23.0.79:554/rtsp/streaming?channel=01%26subtype=0" \
  -o /dev/null -w "    camera 11 -> HTTP %{http_code}\n" 2>&1 || true

echo "==> 3/5 Register camera 2 upstream ..."
curl -s -X PUT "http://127.0.0.1:1984/api/streams/2?src=rtsp://admin:admin@183.82.117.36:554/unicast/c17/s0" \
  -o /dev/null -w "    camera 2 -> HTTP %{http_code}\n" 2>&1 || true

echo "==> 4/5 Verify registered streams ..."
curl -s -m 3 http://127.0.0.1:1984/api/streams | python3 -m json.tool 2>/dev/null || \
  curl -s -m 3 http://127.0.0.1:1984/api/streams 2>&1 | head -c 300

echo
echo "==> 5/5 Test camera 2 pull (does Balaji reach 183.82.117.36:554?) ..."
timeout 6 ffprobe -v error -rtsp_transport tcp -i "rtsp://admin:admin@183.82.117.36:554/unicast/c17/s0" 2>&1 | head -5 && \
  echo "    camera 2 reachable from Balaji ✓" || \
  echo "    !! camera 2 NOT reachable from Balaji — check source URL/network"

echo "==> Done."
