-- ──────────────────────────────────────────────────────────
-- SUPABASE MIGRATION: VISITOR ACTIVE / INACTIVE CONTROL
-- Run this in the Supabase SQL Editor.
-- Adds an is_active flag to visitors. Only ACTIVE visitors
-- are loaded into the face-recognition cache, so an inactive
-- visitor is NOT recognised by the cameras.
-- ──────────────────────────────────────────────────────────

ALTER TABLE public.visitors
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Index so the recognition cache can quickly filter active visitors
CREATE INDEX IF NOT EXISTS idx_visitors_is_active ON public.visitors (is_active);
