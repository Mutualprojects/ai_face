-- ──────────────────────────────────────────────────────────
-- SUPABASE MIGRATION: CAMERAS TABLE & FACE_LOGS ENHANCEMENTS
-- ──────────────────────────────────────────────────────────

-- 1. Create cameras table if it does not exist
CREATE TABLE IF NOT EXISTS public.cameras (
    id TEXT PRIMARY KEY, -- Camera ID matching backend camera keys (e.g. camera_1, cam_entrance)
    name TEXT NOT NULL,
    rtsp_url TEXT,
    location TEXT,
    zone TEXT,
    status TEXT DEFAULT 'active',
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Add camera_id and person_id columns to face_logs if missing
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'face_logs' AND column_name = 'camera_id'
    ) THEN
        ALTER TABLE public.face_logs ADD COLUMN camera_id TEXT REFERENCES public.cameras(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'face_logs' AND column_name = 'person_id'
    ) THEN
        ALTER TABLE public.face_logs ADD COLUMN person_id UUID REFERENCES public.known_faces(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Ensure index for fast presence derivation & timeline queries
CREATE INDEX IF NOT EXISTS idx_face_logs_created_at ON public.face_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_face_logs_person_id ON public.face_logs (person_id);
CREATE INDEX IF NOT EXISTS idx_face_logs_camera_id ON public.face_logs (camera_id);
CREATE INDEX IF NOT EXISTS idx_face_logs_person_created ON public.face_logs (person_id, created_at DESC);

-- 4. Add screen_zones column for TV/screen face suppression
-- Stores normalised exclusion rectangles as JSONB, e.g.:
--   '[{"x1":0.30,"y1":0.00,"x2":0.65,"y2":0.40}]'
-- Any face whose bounding-box centre falls inside a zone is silently
-- discarded by the camera inference worker, preventing TV-screen detections.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'cameras' AND column_name = 'screen_zones'
    ) THEN
        ALTER TABLE public.cameras ADD COLUMN screen_zones JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;
