-- ═══════════════════════════════════════════════════════════════════════════════
-- SENTINEL AI — FIX LOGIN: Create the default admin auth user + admin_users row
--
-- Run this in Supabase SQL Editor. It:
--   1. Ensures pgcrypto (for password hashing)
--   2. Creates the Supabase Auth user  superadmin@sentinel.local / Admin@1234
--   3. Adds a `role` column to admin_users (the login page reads this column)
--   4. Inserts the matching admin_users row linking auth_id
--
-- The login box already defaults to superadmin@sentinel.local / Admin@1234
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. Ensure an RBAC role exists ────────────────────────────────────────────
INSERT INTO public.roles (name, description)
VALUES ('Super Admin', 'Full system access')
ON CONFLICT (name) DO NOTHING;

-- ── 2. Add the `role` column to admin_users if missing ──────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'admin_users' AND column_name = 'role'
    ) THEN
        ALTER TABLE public.admin_users ADD COLUMN role TEXT DEFAULT 'admin';
    END IF;
END $$;

-- ── 3. Create/update the auth user and its admin_users row ──────────────────
DO $$
DECLARE
    v_user_id UUID;
    v_role_id UUID;
BEGIN
    -- Existing auth user?
    BEGIN
        SELECT id INTO v_user_id FROM auth.users WHERE email = 'superadmin@sentinel.local' LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
        v_user_id := NULL;
    END;

    IF v_user_id IS NULL THEN
        v_user_id := gen_random_uuid();

        INSERT INTO auth.users (
            instance_id, id, aud, role, email,
            encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data,
            created_at, updated_at
        )
        VALUES (
            '00000000-0000-0000-0000-000000000000',
            v_user_id,
            'authenticated',
            'authenticated',
            'superadmin@sentinel.local',
            crypt('Admin@1234', gen_salt('bf')),
            timezone('utc'::text, now()),
            '{"provider":"email","providers":["email"]}',
            '{"full_name":"Super Admin"}',
            timezone('utc'::text, now()),
            timezone('utc'::text, now())
        );
    ELSE
        -- Reset password + re-confirm
        UPDATE auth.users
        SET encrypted_password = crypt('Admin@1234', gen_salt('bf')),
            email_confirmed_at  = COALESCE(email_confirmed_at, timezone('utc'::text, now())),
            updated_at          = timezone('utc'::text, now())
        WHERE id = v_user_id;
    END IF;

    -- identity row (required by GoTrue for email sign-in)
    BEGIN
        INSERT INTO auth.identities (
            id, user_id, provider_id, identity_data, provider,
            last_sign_in_at, created_at, updated_at
        )
        VALUES (
            v_user_id, v_user_id, v_user_id::text,
            jsonb_build_object('sub', v_user_id::text, 'email', 'superadmin@sentinel.local'),
            'email',
            timezone('utc'::text, now()),
            timezone('utc'::text, now()),
            timezone('utc'::text, now())
        )
        ON CONFLICT DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        NULL; -- identity may already exist or schema differs; ignore
    END;

    -- FK guard (best effort, not required)
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'fk_admin_users_auth'
        ) THEN
            ALTER TABLE public.admin_users
                ADD CONSTRAINT fk_admin_users_auth
                FOREIGN KEY (auth_id) REFERENCES auth.users(id) ON DELETE CASCADE;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- role_id for Super Admin
    SELECT id INTO v_role_id FROM public.roles WHERE name = 'Super Admin';

    -- Upsert admin_users row
    INSERT INTO public.admin_users (auth_id, email, full_name, department, role, role_id)
    VALUES (
        v_user_id,
        'superadmin@sentinel.local',
        'Super Admin',
        'IT',
        'admin',
        v_role_id
    )
    ON CONFLICT (auth_id) DO UPDATE SET
        email       = EXCLUDED.email,
        full_name   = EXCLUDED.full_name,
        department  = EXCLUDED.department,
        role        = EXCLUDED.role,
        role_id     = EXCLUDED.role_id;

    RAISE NOTICE 'SUCCESS — login with superadmin@sentinel.local / Admin@1234 (id=%)', v_user_id;
END $$;
