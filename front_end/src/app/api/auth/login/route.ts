import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "http://localhost:8005";
const supabaseKey = process.env.SUPABASE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * POST /api/auth/login
 * Authenticate a DB-managed sentinel user (by email + password) and return
 * the session payload (role, name, department) used to drive the dynamic
 * role-based sidebar.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    // Static super-admin override (kept for bootstrap access).
    if (email === "superadmin@sentinel.local" && password === "Admin@1234") {
      return NextResponse.json({
        id: `SUPERADMIN-${Date.now()}`,
        email,
        full_name: "Super Admin",
        department: "IT",
        role: "super_admin",
      });
    }

    const { data, error } = await supabase
      .from("sentinel_users")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    if (data.status === "inactive" || data.status === "suspended") {
      return NextResponse.json({
        error: data.status === "suspended"
          ? "This account is suspended"
          : "This account is inactive",
      }, { status: 403 });
    }

    // Password check (stored in plain text for the local-managed demo).
    if (data.password && data.password !== password) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // Track last login.
    supabase
      .from("sentinel_users")
      .update({ last_login: new Date().toISOString() })
      .eq("id", data.id)
      .then(() => {}, () => {});

    return NextResponse.json({
      id: data.id,
      email: data.email,
      full_name: data.name,
      department: data.department || "",
      role: data.role, // admin | manager | operator | viewer
      modules: Array.isArray(data.modules) ? data.modules : null,
    });
  } catch (err: any) {
    console.error("POST /api/auth/login error:", err);
    return NextResponse.json({ error: err.message || "Login failed" }, { status: 500 });
  }
}
