-- ──────────────────────────────────────────────────────────
-- SUPABASE MIGRATION: FACE_LOGS TOP_MATCHES COMPARISON DATA
-- ──────────────────────────────────────────────────────────
-- Adds a JSONB column to face_logs that stores the top-N closest
-- enrolled identities (name / cosine score / photo_url) for every
-- logged detection. Powers the "closest identities" comparison view
-- in the Log panel so operators can audit near-miss / false-positive
-- matches instead of only seeing the single winning name.
--
-- Run this in the Supabase SQL Editor (or local db).
-- ──────────────────────────────────────────────────────────

ALTER TABLE public.face_logs
    ADD COLUMN IF NOT EXISTS top_matches JSONB DEFAULT '[]'::jsonb;

-- Index for queries that filter logs that carry comparison data.
CREATE INDEX IF NOT EXISTS idx_face_logs_top_matches
    ON public.face_logs (id)
    WHERE top_matches IS NOT NULL AND top_matches <> '[]'::jsonb;
