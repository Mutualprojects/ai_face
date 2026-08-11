-- API Keys for integration partners & SDK clients
-- Run this in the Supabase SQL editor (or apply via migration).
-- Keys are stored hashed (SHA-256); only the prefix is shown in the UI.

CREATE TABLE IF NOT EXISTS public.api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    scopes TEXT[] NOT NULL DEFAULT '{read}',
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    last_used_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON public.api_keys (key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_revoked ON public.api_keys (revoked);
