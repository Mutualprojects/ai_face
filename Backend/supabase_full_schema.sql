-- ═══════════════════════════════════════════════════════════════════════════════
-- SENTINEL AI — COMPLETE DATABASE SCHEMA (Fresh Install)
-- Paste this ENTIRE file into Supabase SQL Editor and run it.
-- Creates ALL tables, indexes, triggers, RLS policies, and seed data.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. HELPER FUNCTION: updated_at auto-updater
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. ORGANIZATIONS (Multi-Tenant)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.organizations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    logo_url    TEXT,
    plan        TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_organizations_status ON public.organizations (status);
CREATE INDEX IF NOT EXISTS idx_organizations_slug   ON public.organizations (slug);

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_organizations_updated_at
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. DEPARTMENTS
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.departments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            TEXT UNIQUE NOT NULL,
    name            TEXT UNIQUE NOT NULL,
    description     TEXT,
    floor_location  TEXT,
    head_person_id  UUID,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    org_id          UUID REFERENCES public.organizations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_departments_code      ON public.departments(code);
CREATE INDEX IF NOT EXISTS idx_departments_is_active ON public.departments(is_active);
CREATE INDEX IF NOT EXISTS idx_departments_org       ON public.departments(org_id);

DROP TRIGGER IF EXISTS trg_departments_updated_at ON public.departments;
CREATE TRIGGER trg_departments_updated_at
    BEFORE UPDATE ON public.departments
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. KNOWN_FACES (Enrolled Employees)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.known_faces (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    photo_url       TEXT,
    employee_code   TEXT,
    department      TEXT,
    designation     TEXT,
    email           TEXT,
    mobile          TEXT,
    embedding       JSONB,
    is_active       BOOLEAN DEFAULT true,
    department_id   UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    org_id          UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_known_faces_employee_code ON public.known_faces(employee_code);
CREATE INDEX IF NOT EXISTS idx_known_faces_is_active     ON public.known_faces(is_active);
CREATE INDEX IF NOT EXISTS idx_known_faces_department_id ON public.known_faces(department_id);
CREATE INDEX IF NOT EXISTS idx_known_faces_org           ON public.known_faces(org_id);

-- FK for departments.head_person_id (deferred because known_faces didn't exist yet)
ALTER TABLE public.departments
    ADD CONSTRAINT fk_departments_head_person
    FOREIGN KEY (head_person_id) REFERENCES public.known_faces(id) ON DELETE SET NULL;

DROP TRIGGER IF EXISTS trg_known_faces_updated_at ON public.known_faces;
CREATE TRIGGER trg_known_faces_updated_at
    BEFORE UPDATE ON public.known_faces
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. VISITORS
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.visitors (
    visitor_id          TEXT PRIMARY KEY,
    full_name           TEXT NOT NULL,
    phone               TEXT,
    company_name        TEXT,
    id_proof_number     TEXT,
    purpose_of_visit    TEXT,
    meet_employee_id    TEXT,
    photo_image         TEXT,
    signature_image     TEXT,
    embedding           JSONB,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    latitude            DOUBLE PRECISION,
    longitude           DOUBLE PRECISION,
    location_address    TEXT,
    check_in_time       TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    check_out_time      TIMESTAMPTZ,
    org_id              UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_visitors_is_active ON public.visitors (is_active);
CREATE INDEX IF NOT EXISTS idx_visitors_org       ON public.visitors (org_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. CAMERAS
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.cameras (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    place           TEXT,
    rtsp_url        TEXT,
    location        TEXT,
    zone            TEXT,
    status          TEXT DEFAULT 'active',
    last_seen_at    TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    screen_zones    JSONB DEFAULT '[]'::jsonb,
    via_relay       BOOLEAN NOT NULL DEFAULT FALSE,
    org_id          UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_cameras_org ON public.cameras (org_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. FACE_LOGS (Recognition Events)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.face_logs (
    id              TEXT PRIMARY KEY,
    person_id       UUID REFERENCES public.known_faces(id) ON DELETE SET NULL,
    person_name     TEXT,
    confidence      DOUBLE PRECISION,
    snapshot_url    TEXT,
    timestamp       TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    camera_id       TEXT REFERENCES public.cameras(id) ON DELETE SET NULL,
    top_matches     JSONB DEFAULT '[]'::jsonb,
    org_id          UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_face_logs_created_at       ON public.face_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_face_logs_person_id        ON public.face_logs (person_id);
CREATE INDEX IF NOT EXISTS idx_face_logs_camera_id        ON public.face_logs (camera_id);
CREATE INDEX IF NOT EXISTS idx_face_logs_person_created   ON public.face_logs (person_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_face_logs_org              ON public.face_logs (org_id);
CREATE INDEX IF NOT EXISTS idx_face_logs_top_matches      ON public.face_logs (id)
    WHERE top_matches IS NOT NULL AND top_matches <> '[]'::jsonb;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. SENTINEL_USERS (Internal App Users)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.sentinel_users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    role        TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'manager', 'operator', 'viewer')),
    department  TEXT NOT NULL DEFAULT '',
    phone       TEXT DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    last_login  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    org_id      UUID REFERENCES public.organizations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sentinel_users_email  ON public.sentinel_users(email);
CREATE INDEX IF NOT EXISTS idx_sentinel_users_role   ON public.sentinel_users(role);
CREATE INDEX IF NOT EXISTS idx_sentinel_users_status ON public.sentinel_users(status);
CREATE INDEX IF NOT EXISTS idx_sentinel_users_org    ON public.sentinel_users(org_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. API_KEYS (Integration / SDK Credentials)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.api_keys (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    description         TEXT,
    prefix              TEXT NOT NULL,
    key_hash            TEXT NOT NULL UNIQUE,
    scopes              TEXT[] NOT NULL DEFAULT '{read}',
    revoked             BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at          TIMESTAMPTZ,
    created_by          TEXT,
    created_at          TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    last_used_at        TIMESTAMPTZ,
    org_id              UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    app_id              UUID,
    rate_limit_rpm      INTEGER NOT NULL DEFAULT 60,
    expires_at          TIMESTAMPTZ,
    allowed_origins     TEXT[] NOT NULL DEFAULT '{}',
    allowed_ips         INET[] NOT NULL DEFAULT '{}',
    last_used_ip        TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON public.api_keys (key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_revoked  ON public.api_keys (revoked);
CREATE INDEX IF NOT EXISTS idx_api_keys_org      ON public.api_keys (org_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active   ON public.api_keys (revoked, expires_at);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. ORGANIZATION_MEMBERS
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.organization_members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name        TEXT,
    email       TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'developer'
                CHECK (role IN ('owner', 'admin', 'developer', 'viewer')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_org_member_email UNIQUE (org_id, email)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.organization_members (org_id);

DROP TRIGGER IF EXISTS trg_org_members_updated_at ON public.organization_members;
CREATE TRIGGER trg_org_members_updated_at
    BEFORE UPDATE ON public.organization_members
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 10. INTEGRATION_APPS
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.integration_apps (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    app_type        TEXT NOT NULL DEFAULT 'other' CHECK (app_type IN (
                        'hrms', 'attendance', 'erp', 'visitor_kiosk', 'mobile',
                        'dashboard', 'analytics', 'iot', 'other'
                    )),
    description     TEXT,
    homepage_url    TEXT,
    icon_url        TEXT,
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_app_name_per_org UNIQUE (org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_apps_org    ON public.integration_apps (org_id);
CREATE INDEX IF NOT EXISTS idx_apps_type   ON public.integration_apps (app_type);
CREATE INDEX IF NOT EXISTS idx_apps_status ON public.integration_apps (status);

DROP TRIGGER IF EXISTS trg_apps_updated_at ON public.integration_apps;
CREATE TRIGGER trg_apps_updated_at
    BEFORE UPDATE ON public.integration_apps
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 11. API_USAGE_LOGS
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.api_usage_logs (
    id          BIGSERIAL PRIMARY KEY,
    api_key_id  UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
    org_id      UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    app_id      UUID,
    method      TEXT,
    path        TEXT,
    status_code INTEGER,
    latency_ms  INTEGER,
    ip          TEXT,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_usage_key_minute ON public.api_usage_logs (api_key_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_org_minute ON public.api_usage_logs (org_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_created    ON public.api_usage_logs (created_at);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 12. INTEGRATION_EVENTS (Realtime Event Bus)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.integration_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    event_type  TEXT NOT NULL CHECK (event_type IN (
                    'face_detected', 'unknown_person', 'presence_changed',
                    'visitor_checked_in', 'visitor_checked_out', 'employee_enrolled',
                    'camera_added', 'camera_removed', 'system_alert'
                )),
    source      TEXT NOT NULL DEFAULT 'engine' CHECK (source IN ('engine', 'portal', 'api')),
    payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_events_org_time  ON public.integration_events (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_type_time ON public.integration_events (event_type, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 13. WEBHOOK_ENDPOINTS
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    app_id          UUID,
    name            TEXT NOT NULL,
    url             TEXT NOT NULL,
    secret          TEXT NOT NULL,
    event_types     TEXT[] NOT NULL DEFAULT '{}',
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_webhook_url_per_org UNIQUE (org_id, url)
);

CREATE INDEX IF NOT EXISTS idx_webhooks_org ON public.webhook_endpoints (org_id, active);

DROP TRIGGER IF EXISTS trg_webhooks_updated_at ON public.webhook_endpoints;
CREATE TRIGGER trg_webhooks_updated_at
    BEFORE UPDATE ON public.webhook_endpoints
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 14. WEBHOOK_DELIVERIES
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint_id     UUID NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
    event_id        UUID REFERENCES public.integration_events(id) ON DELETE SET NULL,
    event_type      TEXT,
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivering', 'success', 'failed')),
    attempts        INTEGER NOT NULL DEFAULT 0,
    next_retry_at   TIMESTAMPTZ,
    last_http_status INTEGER,
    last_error      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    delivered_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_deliveries_retry    ON public.webhook_deliveries (status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_endpoint ON public.webhook_deliveries (endpoint_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 15. RBAC TABLES
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
    role_id       UUID REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES public.permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.admin_users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_id     UUID UNIQUE NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    full_name   TEXT,
    department  TEXT,
    role_id     UUID REFERENCES public.roles(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 16. ROW LEVEL SECURITY — Enable + Permissive Policies
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE public.organizations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.known_faces           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitors              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cameras               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_logs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentinel_users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_apps      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_endpoints     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users           ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for all tables (anon + authenticated full access)
DO $$
DECLARE
    t TEXT;
    tables TEXT[] := ARRAY[
        'public.organizations',
        'public.departments',
        'public.known_faces',
        'public.visitors',
        'public.cameras',
        'public.face_logs',
        'public.sentinel_users',
        'public.api_keys',
        'public.organization_members',
        'public.integration_apps',
        'public.api_usage_logs',
        'public.integration_events',
        'public.webhook_endpoints',
        'public.webhook_deliveries',
        'public.roles',
        'public.permissions',
        'public.role_permissions',
        'public.admin_users'
    ];
BEGIN
    FOREACH t IN ARRAY tables
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Allow all anon" ON %s', t);
        EXECUTE format('DROP POLICY IF EXISTS "Allow all authenticated" ON %s', t);
        EXECUTE format('CREATE POLICY "Allow all anon" ON %s FOR ALL TO anon USING (true) WITH CHECK (true)', t);
        EXECUTE format('CREATE POLICY "Allow all authenticated" ON %s FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
    END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 17. SUPABASE REALTIME PUBLICATION
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.integration_events;
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 18. SEED DATA
-- ═══════════════════════════════════════════════════════════════════════════════

-- 18a. Default Organization
INSERT INTO public.organizations (name, slug, plan, status, created_by)
VALUES ('Default Organization', 'default', 'free', 'active', 'system')
ON CONFLICT (slug) DO NOTHING;

-- 18b. Departments
INSERT INTO public.departments (code, name, description, floor_location) VALUES
    ('ENG',   'Engineering',             'Software development, AI, and systems architecture',           'Building A - 3rd Floor'),
    ('HR',    'People Ops',              'Human resources, talent acquisition, and employee wellness',   'Building A - 2nd Floor'),
    ('SALES', 'Sales & Marketing',       'Enterprise sales, client relations, and growth marketing',    'Building B - 1st Floor'),
    ('FIN',   'Finance',                 'Financial planning, accounting, and payroll',                 'Building A - 4th Floor'),
    ('OPS',   'Operations & Logistics',  'Facilities management and operational supply chain',          'Building B - Ground Floor'),
    ('SEC',   'Surveillance & Security', 'Physical security monitoring, badge issuance, and access control', 'Control Room - Ground Floor')
ON CONFLICT (code) DO NOTHING;

-- 18c. Default Admin + Sample Sentinel Users
INSERT INTO public.sentinel_users (name, email, role, department, phone, status) VALUES
    ('Rajesh Kumar',  'rajesh@brihaspathi.com',   'admin',    'IT',           '+91 98765 43210', 'active'),
    ('Priya Sharma',  'priya@brihaspathi.com',    'manager',  'Security',     '+91 98765 43211', 'active'),
    ('Suresh Reddy',  'suresh@brihaspathi.com',   'operator', 'Operations',   '+91 98765 43212', 'active'),
    ('Anitha Nair',   'anitha@brihaspathi.com',   'viewer',   'Reception',    '+91 98765 43213', 'active'),
    ('Vikram Patel',  'vikram@brihaspathi.com',   'manager',  'HR',           '+91 98765 43214', 'inactive'),
    ('Deepa Menon',   'deepa@brihaspathi.com',    'operator', 'Security',     '+91 98765 43215', 'active'),
    ('Karthik Iyer',  'karthik@brihaspathi.com',  'viewer',   'Facilities',   '+91 98765 43216', 'suspended')
ON CONFLICT (email) DO NOTHING;

-- 18d. Default Organization Members
INSERT INTO public.organization_members (org_id, name, email, role)
SELECT id, 'Rajesh Kumar', 'rajesh@brihaspathi.com', 'owner'
FROM public.organizations WHERE slug = 'default'
ON CONFLICT (org_id, email) DO NOTHING;

-- 18e. RBAC Roles
INSERT INTO public.roles (name, description) VALUES
    ('Super Admin', 'Full system access'),
    ('Admin',       'Organization admin access'),
    ('Manager',     'Department management access'),
    ('Operator',    'Camera and face log access'),
    ('Viewer',      'Read-only access')
ON CONFLICT (name) DO NOTHING;

-- 18f. RBAC Permissions
INSERT INTO public.permissions (name, description) VALUES
    ('faces.read',       'View enrolled faces'),
    ('faces.write',      'Enroll / update / delete faces'),
    ('logs.read',        'View face logs'),
    ('logs.delete',      'Delete face logs'),
    ('cameras.read',     'View cameras'),
    ('cameras.write',    'Add / edit cameras'),
    ('users.read',       'View sentinel users'),
    ('users.write',      'Create / edit sentinel users'),
    ('departments.read', 'View departments'),
    ('departments.write','Create / edit departments'),
    ('visitors.read',    'View visitors'),
    ('visitors.write',   'Register / update visitors'),
    ('analytics.read',   'View analytics and presence'),
    ('settings.read',    'View system settings'),
    ('settings.write',   'Modify system settings'),
    ('api_keys.read',    'View API keys'),
    ('api_keys.write',   'Create / revoke API keys')
ON CONFLICT (name) DO NOTHING;

-- 18g. Role → Permission Mapping (Super Admin gets everything)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r, public.permissions p
WHERE r.name = 'Super Admin'
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 19. BACKFILL: Link all existing rows to Default Organization
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
    default_org UUID;
BEGIN
    SELECT id INTO default_org FROM public.organizations WHERE slug = 'default';
    IF default_org IS NULL THEN RETURN; END IF;

    UPDATE public.known_faces      SET org_id = COALESCE(org_id, default_org) WHERE org_id IS NULL;
    UPDATE public.departments      SET org_id = COALESCE(org_id, default_org) WHERE org_id IS NULL;
    UPDATE public.cameras          SET org_id = COALESCE(org_id, default_org) WHERE org_id IS NULL;
    UPDATE public.face_logs        SET org_id = COALESCE(org_id, default_org) WHERE org_id IS NULL;
    UPDATE public.visitors         SET org_id = COALESCE(org_id, default_org) WHERE org_id IS NULL;
    UPDATE public.sentinel_users   SET org_id = COALESCE(org_id, default_org) WHERE org_id IS NULL;
    UPDATE public.api_keys         SET org_id = COALESCE(org_id, default_org) WHERE org_id IS NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE! All 18 tables created with indexes, triggers, RLS, and seed data.
-- ═══════════════════════════════════════════════════════════════════════════════
