import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client factory.
 * Uses SUPABASE_URL and SUPABASE_KEY to ensure keys are kept secure and not leaked via NEXT_PUBLIC_.
 */
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:8005";
const supabaseKey = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseKey);

export function getSupabaseClient() {
  return createClient(supabaseUrl, supabaseKey);
}
