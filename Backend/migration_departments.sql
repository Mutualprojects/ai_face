-- ──────────────────────────────────────────────────────────
-- SUPABASE MIGRATION: DEPARTMENTS TABLE & KNOWN_FACES INTEGRATION
-- ──────────────────────────────────────────────────────────

-- 1. Create departments table
CREATE TABLE IF NOT EXISTS public.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,                  -- Department Code (e.g. ENG, HR, SALES)
    name TEXT UNIQUE NOT NULL,                  -- Department Name (e.g. Engineering, People Ops)
    description TEXT,                           -- Detailed description
    floor_location TEXT,                        -- Physical office location/zone (e.g. Block A, 3rd Floor)
    head_person_id UUID,                        -- Optional reference to Head of Department
    is_active BOOLEAN DEFAULT true,             -- Status flag
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Add foreign key linkage to known_faces table (if missing)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'known_faces' AND column_name = 'department_id'
    ) THEN
        ALTER TABLE public.known_faces 
        ADD COLUMN department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Add FK constraint for head_person_id to known_faces
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_departments_head_person'
    ) THEN
        ALTER TABLE public.departments 
        ADD CONSTRAINT fk_departments_head_person 
        FOREIGN KEY (head_person_id) REFERENCES public.known_faces(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 4. Create Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_departments_code ON public.departments(code);
CREATE INDEX IF NOT EXISTS idx_departments_is_active ON public.departments(is_active);
CREATE INDEX IF NOT EXISTS idx_known_faces_department_id ON public.known_faces(department_id);

-- 5. Auto-update 'updated_at' timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_departments_updated_at ON public.departments;
CREATE TRIGGER trg_departments_updated_at
    BEFORE UPDATE ON public.departments
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Enable Row Level Security (RLS) & default policies
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access to departments for all" ON public.departments;
CREATE POLICY "Allow read access to departments for all" 
ON public.departments FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Allow insert/update/delete access for authenticated users" ON public.departments;
CREATE POLICY "Allow insert/update/delete access for authenticated users" 
ON public.departments FOR ALL 
USING (true);

-- 7. Seed Initial Departments Data
INSERT INTO public.departments (code, name, description, floor_location)
VALUES 
    ('ENG', 'Engineering', 'Software development, AI, and systems architecture', 'Building A - 3rd Floor'),
    ('HR', 'People Ops', 'Human resources, talent acquisition, and employee wellness', 'Building A - 2nd Floor'),
    ('SALES', 'Sales & Marketing', 'Enterprise sales, client relations, and growth marketing', 'Building B - 1st Floor'),
    ('FIN', 'Finance', 'Financial planning, accounting, and payroll', 'Building A - 4th Floor'),
    ('OPS', 'Operations & Logistics', 'Facilities management and operational supply chain', 'Building B - Ground Floor'),
    ('SEC', 'Surveillance & Security', 'Physical security monitoring, badge issuance, and access control', 'Control Room - Ground Floor')
ON CONFLICT (code) DO NOTHING;

-- 8. Backfill existing text 'department' in known_faces to department_id
UPDATE public.known_faces kf
SET department_id = d.id
FROM public.departments d
WHERE LOWER(kf.department) = LOWER(d.name)
  AND kf.department_id IS NULL;
