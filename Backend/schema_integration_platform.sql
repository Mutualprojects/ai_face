-- ═══════════════════════════════════════════════════════════════════════════════
-- SENTINEL MULTI-TENANT INTEGRATION PLATFORM SCHEMA
-- Organization-based developer/partner platform (NOT HRMS-specific — generic).
--
-- Model:
--   organizations  (tenant / customer)
--        │
--        ├── organization_members   (owners/admins/developers who manage the tenant)
--        ├── integration_apps      (HRMS, Attendance, ERP, Visitor Kiosk, Mobile, ...)
--        │        ├── api_keys           (per-app credentials w/ scopes, rate limit, expiry, IP/origin allowlists)
--        │        ├── webhook_endpoints  (receive events via HTTP callbacks)
--        │        └── api_usage_logs     (per-request metering / rate limiting)
--        ├── integration_events    (realtime event bus: face_detected, presence_changed, ...)
--        └── webhook_deliveries    (retryable webhook attempts)
--
-- Tenant-scoping is added to every business table via an org_id column:
--   known_faces, departments, cameras, face_logs, visitors.
--
-- RLS is enabled on all NEW tables with permissive anon/authenticated policies
-- (matching the existing project convention). The optional hardening section at
-- the bottom shows how to enforce strict org isolation using a JWT org claim.
--
-- SAFE TO RE-RUN: all statements are idempotent.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Helper: updated_at trigger function (create only if missing — the project
--    may already define it under a different owner)
-- ─────────────────────────────────────────────────────────────────────────────
DO $do$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column') THEN
        CREATE FUNCTION public.update_updated_at_column()
        RETURNS TRIGGER AS $func$
        BEGIN
            NEW.updated_at = timezone('utc'::text, now());
            RETURN NEW;
        END;
        $func$ LANGUAGE plpgsql;
    END IF;
END $do$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ORGANIZATIONS (the tenant)
-- ─────────────────────────────────────────────────────────────────────────────
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
CREATE INDEX IF NOT EXISTS idx_organizations_plan   ON public.organizations (plan);

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_organizations_updated_at
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ORGANIZATION MEMBERS (who can manage the tenant in the portal)
-- ─────────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. INTEGRATION APPS (one app per partner system, per organization)
--    app_type is generic — HRMS is just one of many partner types.
-- ─────────────────────────────────────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_apps_org       ON public.integration_apps (org_id);
CREATE INDEX IF NOT EXISTS idx_apps_type      ON public.integration_apps (app_type);
CREATE INDEX IF NOT EXISTS idx_apps_status    ON public.integration_apps (status);

DROP TRIGGER IF EXISTS trg_apps_updated_at ON public.integration_apps;
CREATE TRIGGER trg_apps_updated_at
    BEFORE UPDATE ON public.integration_apps
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. API KEYS → upgrade existing table to be tenant + app aware
--    Adds rate limiting, expiry, origin/IP allowlists.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.api_keys
    ADD COLUMN IF NOT EXISTS org_id              UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS app_id              UUID REFERENCES public.integration_apps(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS rate_limit_rpm      INTEGER NOT NULL DEFAULT 60,
    ADD COLUMN IF NOT EXISTS expires_at          TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS allowed_origins     TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS allowed_ips         INET[]  NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS last_used_ip        TEXT;

CREATE INDEX IF NOT EXISTS idx_api_keys_org      ON public.api_keys (org_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_app      ON public.api_keys (app_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active   ON public.api_keys (revoked, expires_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. API USAGE LOGS (per-request metering → rate limiting, quotas, billing)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.api_usage_logs (
    id          BIGSERIAL PRIMARY KEY,
    api_key_id  UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
    org_id      UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    app_id      UUID REFERENCES public.integration_apps(id) ON DELETE SET NULL,
    method      TEXT,
    path        TEXT,
    status_code INTEGER,
    latency_ms  INTEGER,
    ip          TEXT,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Rate limiting: count requests per key per minute
CREATE INDEX IF NOT EXISTS idx_usage_key_minute ON public.api_usage_logs (api_key_id, created_at);
-- Metering per org/app
CREATE INDEX IF NOT EXISTS idx_usage_org_minute ON public.api_usage_logs (org_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_created    ON public.api_usage_logs (created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. INTEGRATION EVENTS — realtime event bus (Supabase Realtime + webhooks + polling)
--    Event types are generic across the whole platform.
-- ─────────────────────────────────────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_events_org_time    ON public.integration_events (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_type_time   ON public.integration_events (event_type, created_at DESC);

-- Publish on the realtime bus so apps can subscribe live
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.integration_events;
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. WEBHOOK ENDPOINTS (outbound HTTP callbacks per org/app)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    app_id          UUID REFERENCES public.integration_apps(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    url             TEXT NOT NULL,
    secret          TEXT NOT NULL,   -- HMAC signing secret (shown once, mask in UI)
    event_types     TEXT[] NOT NULL DEFAULT '{}',  -- empty = all events
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. WEBHOOK DELIVERIES (retryable delivery attempts)
-- ─────────────────────────────────────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_deliveries_retry ON public.webhook_deliveries (status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_endpoint ON public.webhook_deliveries (endpoint_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. TENANT-SCOPE THE CORE BUSINESS TABLES (org_id added everywhere)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.known_faces  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.departments  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.cameras      ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.face_logs    ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.visitors     ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_known_faces_org ON public.known_faces (org_id);
CREATE INDEX IF NOT EXISTS idx_departments_org ON public.departments (org_id);
CREATE INDEX IF NOT EXISTS idx_cameras_org     ON public.cameras (org_id);
CREATE INDEX IF NOT EXISTS idx_face_logs_org   ON public.face_logs (org_id);
CREATE INDEX IF NOT EXISTS idx_visitors_org    ON public.visitors (org_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. ROW LEVEL SECURITY on all NEW tables + grants
--     Permissive for anon/authenticated (matches existing project convention;
--     the backend uses the service-role key which bypasses RLS anyway).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.organizations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_apps     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_endpoints    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries   ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'public.organizations',
        'public.organization_members',
        'public.integration_apps',
        'public.api_usage_logs',
        'public.integration_events',
        'public.webhook_endpoints',
        'public.webhook_deliveries'
    ]
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "%s_all_anon" ON %s', t, t);
        EXECUTE format('DROP POLICY IF EXISTS "%s_all_authenticated" ON %s', t, t);
        EXECUTE format('CREATE POLICY "%s_all_anon" ON %s FOR ALL TO anon USING (true) WITH CHECK (true)', t, t);
        EXECUTE format('CREATE POLICY "%s_all_authenticated" ON %s FOR ALL TO authenticated USING (true) WITH CHECK (true)', t, t);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO anon, authenticated', t);
    END LOOP;
END $$;

-- api_keys kept RLS-disabled (already in production use); grant extended access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. SEED: default organization + link existing rows to it
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.organizations (name, slug, plan, status, created_by)
VALUES ('Default Organization', 'default', 'free', 'active', 'system')
ON CONFLICT (slug) DO NOTHING;

DO $$
DECLARE default_org UUID;
BEGIN
    SELECT id INTO default_org FROM public.organizations WHERE slug = 'default';

    UPDATE public.api_keys      SET org_id = COALESCE(org_id, default_org) WHERE org_id IS NULL;
    UPDATE public.known_faces   SET org_id = COALESCE(org_id, default_org) WHERE org_id IS NULL;
    UPDATE public.departments   SET org_id = COALESCE(org_id, default_org) WHERE org_id IS NULL;
    UPDATE public.cameras       SET org_id = COALESCE(org_id, default_org) WHERE org_id IS NULL;
    UPDATE public.face_logs     SET org_id = COALESCE(org_id, default_org) WHERE org_id IS NULL;
    UPDATE public.visitors      SET org_id = COALESCE(org_id, default_org) WHERE org_id IS NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 12. OPTIONAL HARDENING — STRICT ORG ISOLATION VIA JWT CLAIM
--     Uncomment to enforce tenant isolation in RLS. Requires clients to send a
--     JWT carrying the org claim (e.g. {"app_metadata": {"org_id": "..."}}).
--     Leave commented while your clients use the anon/service keys.
-- ═══════════════════════════════════════════════════════════════════════════════
-- CREATE OR REPLACE FUNCTION public.current_org_id()
-- RETURNS UUID LANGUAGE sql STABLE AS $$
--     SELECT COALESCE(
--         NULLIF(auth.jwt() ->> 'org_id', '')::uuid,
--         NULLIF((auth.jwt() -> 'app_metadata' ->> 'org_id'), '')::uuid
--     );
-- $$;
--
-- -- Example: replace the permissive policies above with org-scoped ones:
-- -- DROP POLICY IF EXISTS "public.face_logs_org" ON public.face_logs;
-- -- ALTER TABLE public.face_logs ENABLE ROW LEVEL SECURITY;
-- -- CREATE POLICY "face_logs_org_isolation"
-- --     ON public.face_logs FOR ALL
-- --     USING (public.current_org_id() IS NULL OR org_id = public.current_org_id())
-- --     WITH CHECK (org_id = public.current_org_id());

COMMIT;
