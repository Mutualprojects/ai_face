import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "http://localhost:8005";
const supabaseKey = process.env.SUPABASE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * GET /api/sentinel_users
 * Fetch all users, with optional role and status filters.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    let query = supabase
      .from("sentinel_users")
      .select("*")
      .order("created_at", { ascending: false });

    if (role && role !== "all") {
      query = query.eq("role", role);
    }
    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,department.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Supabase fetch users error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err: any) {
    console.error("GET /api/sentinel_users error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/sentinel_users
 * Create a new user.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, role, department, phone, status } = body;

    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!email?.trim()) return NextResponse.json({ error: "Email is required" }, { status: 400 });

    const { data, error } = await supabase
      .from("sentinel_users")
      .insert({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role: role || "viewer",
        department: department || "",
        phone: phone || "",
        status: status || "active",
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
      }
      console.error("Supabase create user error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/sentinel_users error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
