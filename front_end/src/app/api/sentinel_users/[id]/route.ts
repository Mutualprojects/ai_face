import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "http://localhost:8005";
const supabaseKey = process.env.SUPABASE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * GET /api/sentinel_users/[id]
 * Fetch a single user by ID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data, error } = await supabase
      .from("sentinel_users")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * PUT /api/sentinel_users/[id]
 * Update a user by ID.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, email, role, department, phone, status } = body;

    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name.trim();
    if (email !== undefined) updates.email = email.trim().toLowerCase();
    if (role !== undefined) updates.role = role;
    if (department !== undefined) updates.department = department;
    if (phone !== undefined) updates.phone = phone;
    if (status !== undefined) updates.status = status;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("sentinel_users")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
      }
      console.error("Supabase update user error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/sentinel_users/[id]
 * Delete a user by ID.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data, error } = await supabase
      .from("sentinel_users")
      .delete()
      .eq("id", id)
      .select();

    if (error) {
      console.error("Supabase delete user error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `User deleted.`,
      deleted_count: data?.length || 0,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
