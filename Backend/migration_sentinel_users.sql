-- ═══════════════════════════════════════════════════════════════════
-- SENTINEL AI — User Management Table
-- Run this SQL in Supabase SQL Editor to create the users table
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.sentinel_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'manager', 'operator', 'viewer')),
    department TEXT NOT NULL DEFAULT '',
    phone TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sentinel_users_email ON public.sentinel_users(email);
CREATE INDEX IF NOT EXISTS idx_sentinel_users_role ON public.sentinel_users(role);
CREATE INDEX IF NOT EXISTS idx_sentinel_users_status ON public.sentinel_users(status);
CREATE INDEX IF NOT EXISTS idx_sentinel_users_org ON public.sentinel_users(org_id);

-- RLS: Allow all operations (matching existing project pattern)
ALTER TABLE public.sentinel_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON public.sentinel_users FOR ALL USING (true) WITH CHECK (true);

-- Insert default admin user
INSERT INTO public.sentinel_users (name, email, role, department, phone, status)
VALUES ('Rajesh Kumar', 'rajesh@brihaspathi.com', 'admin', 'IT', '+91 98765 43210', 'active')
ON CONFLICT (email) DO NOTHING;

-- Insert sample users
INSERT INTO public.sentinel_users (name, email, role, department, phone, status) VALUES
('Priya Sharma', 'priya@brihaspathi.com', 'manager', 'Security', '+91 98765 43211', 'active'),
('Suresh Reddy', 'suresh@brihaspathi.com', 'operator', 'Operations', '+91 98765 43212', 'active'),
('Anitha Nair', 'anitha@brihaspathi.com', 'viewer', 'Reception', '+91 98765 43213', 'active'),
('Vikram Patel', 'vikram@brihaspathi.com', 'manager', 'HR', '+91 98765 43214', 'inactive'),
('Deepa Menon', 'deepa@brihaspathi.com', 'operator', 'Security', '+91 98765 43215', 'active'),
('Karthik Iyer', 'karthik@brihaspathi.com', 'viewer', 'Facilities', '+91 98765 43216', 'suspended')
ON CONFLICT (email) DO NOTHING;
