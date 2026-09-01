-- ============================================================
-- RLS Policy Fix for Sentinel AI
-- Run this in Supabase SQL Editor / psql on 172.30.0.200
-- Fixes: "new row violates row-level security policy"
-- ============================================================

-- 1. Allow anon to INSERT/SELECT on known_faces table
ALTER TABLE known_faces ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'anon_insert_known_faces' AND tablename = 'known_faces'
  ) THEN
    CREATE POLICY anon_insert_known_faces ON known_faces
      FOR INSERT TO anon WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'anon_select_known_faces' AND tablename = 'known_faces'
  ) THEN
    CREATE POLICY anon_select_known_faces ON known_faces
      FOR SELECT TO anon USING (true);
  END IF;
END $$;

-- 2. Allow anon to INSERT/SELECT on visitors table
ALTER TABLE visitors ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'anon_insert_visitors' AND tablename = 'visitors'
  ) THEN
    CREATE POLICY anon_insert_visitors ON visitors
      FOR INSERT TO anon WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'anon_select_visitors' AND tablename = 'visitors'
  ) THEN
    CREATE POLICY anon_select_visitors ON visitors
      FOR SELECT TO anon USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'anon_update_visitors' AND tablename = 'visitors'
  ) THEN
    CREATE POLICY anon_update_visitors ON visitors
      FOR UPDATE TO anon USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'anon_delete_visitors' AND tablename = 'visitors'
  ) THEN
    CREATE POLICY anon_delete_visitors ON visitors
      FOR DELETE TO anon USING (true);
  END IF;
END $$;

-- 3. Allow anon to upload/read from 'face' storage bucket
-- (Supabase self-hosted: storage.objects table + storage.buckets)

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'anon_insert_storage_face' AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY anon_insert_storage_face ON storage.objects
      FOR INSERT TO anon
      WITH CHECK (bucket_id = 'face');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'anon_select_storage_face' AND tablename = 'objects' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY anon_select_storage_face ON storage.objects
      FOR SELECT TO anon
      USING (bucket_id = 'face');
  END IF;
END $$;

-- 4. Ensure face_logs table allows anon insert/select/update
ALTER TABLE face_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'anon_all_face_logs' AND tablename = 'face_logs'
  ) THEN
    CREATE POLICY anon_all_face_logs ON face_logs
      FOR ALL TO anon
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 5. Ensure api_keys table allows anon (needed for auth check)
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'anon_select_api_keys' AND tablename = 'api_keys'
  ) THEN
    CREATE POLICY anon_select_api_keys ON api_keys
      FOR SELECT TO anon USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'anon_insert_api_keys' AND tablename = 'api_keys'
  ) THEN
    CREATE POLICY anon_insert_api_keys ON api_keys
      FOR INSERT TO anon WITH CHECK (true);
  END IF;
END $$;

-- 6. cameras table policies
ALTER TABLE cameras ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'anon_all_cameras' AND tablename = 'cameras'
  ) THEN
    CREATE POLICY anon_all_cameras ON cameras
      FOR ALL TO anon
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 7. sentinel_users table policies
ALTER TABLE sentinel_users ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'anon_all_sentinel_users' AND tablename = 'sentinel_users'
  ) THEN
    CREATE POLICY anon_all_sentinel_users ON sentinel_users
      FOR ALL TO anon
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 8. departments table policies
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'anon_all_departments' AND tablename = 'departments'
  ) THEN
    CREATE POLICY anon_all_departments ON departments
      FOR ALL TO anon
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Done. Storage + all tables now allow anon role (full local deployment).
-- For production internet-facing, replace 'anon' policies with 'authenticated' or JWT-based policies.
