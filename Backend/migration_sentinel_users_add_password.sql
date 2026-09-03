-- ═══════════════════════════════════════════════════════════════════
-- SENTINEL AI — Add password column for role-based login
-- Run this SQL in Supabase SQL Editor after migration_sentinel_users.sql
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.sentinel_users
    ADD COLUMN IF NOT EXISTS password TEXT;

-- Seed demo login passwords (email + password → role-driven sidebar):
--   rajesh@brihaspathi.com   / Admin@123     → admin     (full backend nav)
--   priya@brihaspathi.com    / Manager@123   → manager
--   suresh@brihaspathi.com   / Operator@123  → operator
--   anitha@brihaspathi.com   / Viewer@123    → viewer
--   deepa@brihaspathi.com    / Operator@123  → operator
--   karthik@brihaspathi.com  / Viewer@123    → viewer (suspended)
UPDATE public.sentinel_users SET password = 'Admin@123'    WHERE email = 'rajesh@brihaspathi.com';
UPDATE public.sentinel_users SET password = 'Manager@123'  WHERE email = 'priya@brihaspathi.com';
UPDATE public.sentinel_users SET password = 'Operator@123' WHERE email = 'suresh@brihaspathi.com';
UPDATE public.sentinel_users SET password = 'Viewer@123'   WHERE email = 'anitha@brihaspathi.com';
UPDATE public.sentinel_users SET password = 'Operator@123' WHERE email = 'deepa@brihaspathi.com';
UPDATE public.sentinel_users SET password = 'Viewer@123'   WHERE email = 'karthik@brihaspathi.com';

-- Per-user module/feature override (drives the role-based sidebar when set).
ALTER TABLE public.sentinel_users
    ADD COLUMN IF NOT EXISTS modules TEXT[] DEFAULT NULL;

-- Expose the new columns to PostgREST's schema cache so the REST API returns them.
NOTIFY pgrst, 'reload schema';

-- Granular per-user permission keys (capability editor in User Management).
ALTER TABLE public.sentinel_users
    ADD COLUMN IF NOT EXISTS permissions TEXT[] DEFAULT NULL;
