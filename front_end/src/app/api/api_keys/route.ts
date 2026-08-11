import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID } from "crypto";

const supabaseUrl = process.env.SUPABASE_URL || "http://localhost:8005";
const supabaseKey = process.env.SUPABASE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

export const API_KEY_PREFIX = "sentinel_live_";
export const VALID_KEY_SCOPES = ["read", "write", "admin"];

export function hashApiKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateApiKey(): { prefix: string; secretKey: string } {
  const secret = randomBytes(24).toString("base64url");
  const prefix = API_KEY_PREFIX + randomBytes(4).toString("hex");
  return { prefix, secretKey: `${prefix}.${secret}` };
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("api_keys")
      .select("id, name, description, prefix, scopes, revoked, org_id, app_id, created_at, last_used_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase fetch api_keys error:", error);
      return NextResponse.json(
        { error: "api_keys table not available. Apply Backend/schema_api_keys.sql in Supabase." },
        { status: 500 }
      );
    }

    return NextResponse.json({ keys: data || [] });
  } catch (err) {
    console.error("Next.js fetch api_keys error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const name = (payload.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "Missing name" }, { status: 400 });
    }

    let scopes: string[] = Array.isArray(payload.scopes) ? payload.scopes : [payload.scopes].filter(Boolean);
    if (typeof payload.scopes === "string") {
      scopes = payload.scopes.split(",").map((s: string) => s.trim()).filter(Boolean);
    }
    const invalid = scopes.filter((s: string) => !VALID_KEY_SCOPES.includes(s));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Invalid scope(s): ${invalid.join(", ")}. Valid: ${VALID_KEY_SCOPES.join(", ")}` },
        { status: 400 }
      );
    }
    scopes = [...new Set(scopes)].sort();
    if (scopes.length === 0) scopes = ["read"];

    const { prefix, secretKey } = generateApiKey();

    const { data, error } = await supabase
      .from("api_keys")
      .insert({
        id: randomUUID(),
        name,
        description: (payload.description || "").trim() || null,
        prefix,
        key_hash: hashApiKey(secretKey),
        scopes,
        org_id: payload.org_id || null,
        app_id: payload.app_id || null,
        rate_limit_rpm: payload.rate_limit_rpm ? Number(payload.rate_limit_rpm) : 60,
        expires_at: payload.expires_at || null,
        created_by: (payload.created_by || "").trim() || null,
      })
      .select("id, name, prefix, scopes, org_id, app_id, created_at")
      .single();

    if (error) {
      console.error("Supabase create api_key error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: true,
        key: {
          id: data.id,
          name: data.name,
          prefix: data.prefix,
          scopes: data.scopes,
          created_at: data.created_at,
          // Shown exactly once at creation; only the hash is stored.
          secret_key: secretKey,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Next.js create api_key error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
