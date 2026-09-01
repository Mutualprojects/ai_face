#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# Deploy go2rtc relay on Balaji (the host that CAN reach camera 11).
# Run ON BALAJI as the btl user:
#
#   bash <(curl -sL https://raw.githubusercontent.com/AlexxIT/go2rtc/master/install.sh)
#   then copy /root/vmslatest/... relay config here, or run this script.
#
# This creates /opt/rtsp-relay with the correct config and a systemd
# auto-restart service so it never goes down again.
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

echo "==> 1/4 Installing go2rtc binary ..."
if [ ! -x /usr/local/bin/go2rtc ]; then
  curl -sL https://github.com/AlexxIT/go2rtc/releases/latest/download/go2rtc_linux_amd64 \
    -o /usr/local/bin/go2rtc
  chmod +x /usr/local/bin/go2rtc
fi
go2rtc --version || true

echo "==> 2/4 Writing relay config (no API/RTSP auth, backend auto-registers) ..."
mkdir -p /opt/rtsp-relay
cat > /opt/rtsp-relay/go2rtc.yaml <<'YAML'
api:
  listen: ":1984"
rtsp:
  listen: ":8554"
webrtc:
  listen: ":8555/tcp"
log:
  level: info
streams: {}
YAML

echo "==> 3/4 Installing systemd service (auto-restart + boot-start) ..."
cat > /etc/systemd/system/go2rtc.service <<'UNIT'
[Unit]
Description=go2rtc RTSP/WebRTC relay (Sentinel)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/go2rtc -config /opt/rtsp-relay/go2rtc.yaml
WorkingDirectory=/opt/rtsp-relay
Restart=always
RestartSec=3
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable go2rtc >/dev/null 2>&1 || true
systemctl restart go2rtc

echo "==> 4/4 Verifying ..."
sleep 2
if curl -s -m 3 http://127.0.0.1:1984/api/streams >/dev/null; then
  echo "    RELAY UP on :1984 / :8554  ✓"
else
  echo "    !! relay failed — check: systemctl status go2rtc ; journalctl -u go2rtc -n 30"
  exit 1
fi

# Pre-register camera 11 so it's warm even before the backend re-registers it.
curl -s -X PUT "http://127.0.0.1:1984/api/streams/11?src=rtsp://admin:admin@172.23.0.79:554/rtsp/streaming?channel=01%26subtype=0" >/dev/null 2>&1 || true

echo "==> Done. Relay is a permanent auto-healing service on Balaji."
