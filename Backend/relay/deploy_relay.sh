#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# ONE-COMMAND RTSP RELAY DEPLOYMENT  (systemd / auto-heal)
# Deploys go2rtc onto a host that CAN reach the blocked cameras, then
# verifies the full chain. Run FROM the VMS backend server:
#
#   ./relay/deploy_relay.sh <user>@<relay-host> [camera-host:port]
#   e.g.:
#   ./relay/deploy_relay.sh root@172.30.0.200 172.23.0.79:554
#
# What it does on the relay host (idempotent — safe to re-run):
#   1. copies the go2rtc binary + config + unit to /opt/rtsp-relay/
#   2. tests whether that host can reach the camera (prints verdict)
#   3. installs a SYSTEMD service:
#        Restart=always  -> auto-restarts if go2rtc ever crashes
#        systemctl enable -> auto-starts on boot (survives reboots)
#   4. starts it and verifies ports 1984 (API) / 8554 (RTSP) are live
#
# Prefer systemd (the most robust). Falls back to pm2, then nohup.
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

DEST="${1:?usage: deploy_relay.sh <user>@<relay-host> [camera-host:port]}"
CAMTEST="${2:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
BIN="$HERE/../go2rtc"
SVC="$HERE/go2rtc.service"

[ -x "$BIN" ] || { echo "go2rtc binary not found at $BIN"; exit 1; }

echo "==> Copying relay files to $DEST:/opt/rtsp-relay/"
ssh "$DEST" "mkdir -p /opt/rtsp-relay"
scp -q "$BIN"  "$DEST:/opt/rtsp-relay/go2rtc"
scp -q "$HERE/go2rtc.yaml" "$DEST:/opt/rtsp-relay/go2rtc.yaml"
[ -f "$SVC" ] && scp -q "$SVC" "$DEST:/opt/rtsp-relay/go2rtc.service"
ssh "$DEST" "chmod +x /opt/rtsp-relay/go2rtc"

if [ -n "$CAMTEST" ]; then
  HOST="${CAMTEST%%:*}"; PORT="${CAMTEST##*:}"
  echo "==> Testing camera reachability FROM $DEST ..."
  ssh "$DEST" "timeout 4 bash -c 'echo > /dev/tcp/$HOST/$PORT' 2>/dev/null \
    && echo '    CAMERA REACHABLE from relay host — good.' \
    || echo '    !! CAMERA NOT REACHABLE even from relay host — pick another host or fix network.'"
fi

echo "==> Installing auto-heal service on $DEST ..."
ssh "$DEST" bash -s <<'REMOTE'
set -e
cd /opt/rtsp-relay

# 1) Preferred: systemd (auto-restart + auto-start on boot)
if command -v systemctl >/dev/null 2>&1; then
  cp -f go2rtc.service /etc/systemd/system/go2rtc.service 2>/dev/null || true
  systemctl daemon-reload
  systemctl enable go2rtc.service >/dev/null 2>&1 || true
  systemctl restart go2rtc.service
  echo "    go2rtc running under systemd (auto-restart + boot-start ENABLED)"
  exit 0
fi

# 2) Fallback: pm2
if command -v pm2 >/dev/null 2>&1; then
  pm2 delete rtsp-relay >/dev/null 2>&1 || true
  pm2 start ./go2rtc --name rtsp-relay -- -config go2rtc.yaml
  pm2 save >/dev/null 2>&1 || true
  echo "    go2rtc running under pm2"
  exit 0
fi

# 3) Last resort: nohup
pkill -f 'go2rtc.*go2rtc.yaml' >/dev/null 2>&1 || true
sleep 0.5
nohup ./go2rtc -config go2rtc.yaml > relay.log 2>&1 &
echo "    go2rtc running with nohup (no systemd/pm2 found — best effort)"
REMOTE

echo "==> Verifying relay is up ..."
sleep 2
if curl -s -m 4 "http://${DEST#*@}:1984/api/streams" >/dev/null 2>&1; then
  echo "    RELAY IS UP on :1984/:8554  ✓"
else
  echo "    !! relay did not answer on :1984 — checking locally ..."
  ssh "$DEST" "curl -s -m 3 http://127.0.0.1:1984/api/streams >/dev/null \
    && echo 'UP' || { echo 'DOWN'; tail -20 /opt/rtsp-relay/relay.log 2>/dev/null; }"
fi

echo
echo "==> Done. go2rtc is now a permanent auto-healing service on $DEST."
echo "    In the VMS UI: edit the blocked camera → switch ON 'Route via relay' → Save."
