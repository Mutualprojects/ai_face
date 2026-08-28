-- ──────────────────────────────────────────────────────────
-- MIGRATION: UNIVERSAL RTSP RELAY ROUTING FOR CAMERAS
-- ──────────────────────────────────────────────────────────
-- Adds per-camera relay routing. A camera flagged via_relay=true is NOT
-- pulled directly by this backend (which may be firewalled away from the
-- camera); instead an external go2rtc relay host pulls the camera and this
-- backend consumes the relay's restream:
--
--   camera → go2rtc relay (e.g. 172.30.0.200:8554) → MediaMTX → workers
--
-- Apply in Supabase Studio SQL editor or psql.

ALTER TABLE public.cameras
    ADD COLUMN IF NOT EXISTS via_relay BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.cameras.via_relay IS
    'When true the stream is pulled through the external RTSP relay (RTSP_RELAY_* env) instead of directly from the camera.';
