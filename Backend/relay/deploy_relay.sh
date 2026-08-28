#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# ONE-COMMAND RTSP RELAY DEPLOYMENT
# Deploys go2rtc onto a host that CAN reach the blocked cameras, then
# verifies the full chain. Run FROM the VMS backend server:
#
#   ./relay/deploy_relay.sh <user>@<relay-host> [camera-host:port]
#   e.g.:
#   ./relay/deploy_relay.sh root@172.30.0.200 172.23.0.79:554
#
# What it does on the relay host:
#   1. copies the go2rtc binary + config to /opt/rtsp-relay/
#   2. tests whether that host can reach the camera (prints verdict)
#   3. starts go2rtc under pm2 (survives reboots once pm2 startup is set)
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

DEST="${1:?usage: deploy_relay.sh <user>@<relay-host> [camera-host:port]}"
CAMTEST="${2:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
BIN="$HERE/../go2rtc"

[ -x "$BIN" ] || { echo "go2rtc binary not found at $BIN"; exit 1; }

echo "==> Copying relay files to $DEST:/opt/rtsp-relay/"
ssh "$DEST" "mkdir -p /opt/rtsp-relay"
scp -q "$BIN" "$DEST:/opt/rtsp-relay/go2rtc"
scp -q "$HERE/go2rtc.yaml" "$DEST:/opt/rtsp-relay/go2rtc.yaml"
ssh "$DEST" "chmod +x /opt/rtsp-relay/go2rtc"

if [ -n "$CAMTEST" ]; then
  HOST="${CAMTEST%%:*}"; PORT="${CAMTEST##*:}"
  echo "==> Testing camera reachability FROM $DEST ..."
  ssh "$DEST" "timeout 4 bash -c 'echo > /dev/tcp/$HOST/$PORT' 2>/dev/null \
    && echo '    CAMERA REACHABLE from relay host — good.' \
    || echo '    !! CAMERA NOT REACHABLE even from relay host — pick another host or fix network.'"
fi

echo "==> Starting go2rtc under pm2 on $DEST ..."
ssh "$DEST" bash -s <<'REMOTE'
cd /opt/rtsp-relay
if command -v pm2 >/dev/null 2>&1; then
  pm2 delete rtsp-relay >/dev/null 2>&1 || true
  pm2 start ./go2rtc --name rtsp-relay -- -config go2rtc.yaml
  pm2 save >/dev/null 2>&1 || true
else
  echo "    pm2 not found — starting with nohup instead."
  pkill -f 'go2rtc.*go2rtc.yaml' >/dev/null 2>&1 || true
  sleep 0.5
  nohup ./go2rtc -config go2rtc.yaml > relay.log 2>&1 &
fi
sleep 2
curl -s -m 3 http://127.0.0.1:1984/api/streams >/dev/null && echo "    RELAY IS UP on :1984/:8554" \
  || echo "    !! relay did not answer on :1984 — check /opt/rtsp-relay/relay.log"
REMOTE

echo
echo "==> Done. Now in the VMS UI: edit the blocked camera → switch ON 'Route via relay' → Save."
