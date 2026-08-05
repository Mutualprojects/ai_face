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
