import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "http://localhost:8005";
const supabaseKey = process.env.SUPABASE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  try {
    // 1. Fetch departments from database
    const { data: deptData, error: deptError } = await supabase
      .from("departments")
      .select("id, code, name, description, floor_location, is_active, created_at")
      .order("name");

    // Fetch all employee records to calculate dynamic relational counts
    const { data: employeesData } = await supabase
      .from("known_faces")
      .select("id, department, department_id, is_active");

    const empList = employeesData || [];

    if (!deptError && deptData && deptData.length > 0) {
      // Map relational counts per department
      const enrichedDepts = deptData.map((dept) => {
        const count = empList.filter(
          (emp: any) =>
            emp.department_id === dept.id ||
            (emp.department && emp.department.toLowerCase() === dept.name.toLowerCase())
        ).length;
        const activeCount = empList.filter(
          (emp: any) =>
            emp.is_active &&
            (emp.department_id === dept.id ||
              (emp.department && emp.department.toLowerCase() === dept.name.toLowerCase()))
        ).length;

        return {
          ...dept,
          employee_count: count,
          active_employee_count: activeCount,
        };
      });

      return NextResponse.json(enrichedDepts);
    }

    // 2. Fallback: extract distinct departments from known_faces if departments table is not yet seeded
    const fallbackNames = Array.from(
      new Set(
        empList
          .map((item: any) => item.department)
          .filter((d: any) => Boolean(d) && typeof d === "string")
      )
    ) as string[];

    const defaultNames = [
      "Engineering",
      "People Ops",
      "Sales & Marketing",
      "Finance",
      "Operations & Logistics",
      "Surveillance & Security",
    ];

    const allNames = Array.from(new Set([...fallbackNames, ...defaultNames]));

    const fallbackDepts = allNames.map((name, index) => {
      const count = empList.filter(
        (emp: any) => emp.department && emp.department.toLowerCase() === name.toLowerCase()
      ).length;
      const activeCount = empList.filter(
        (emp: any) => emp.is_active && emp.department && emp.department.toLowerCase() === name.toLowerCase()
      ).length;

      return {
        id: `dept-fallback-${index}`,
        code: name.substring(0, 5).toUpperCase().replace(/\s+/g, ""),
        name,
        description: `${name} Department`,
        floor_location: "Main Building",
        is_active: true,
        employee_count: count,
        active_employee_count: activeCount,
      };
    });

    return NextResponse.json(fallbackDepts);
  } catch (err: any) {
    console.error("Next.js fetch departments error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { code, name, description, floor_location } = payload;

    if (!name || !code) {
      return NextResponse.json(
        { error: "Department name and code are required." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("departments")
      .insert({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        description: description?.trim() || null,
        floor_location: floor_location?.trim() || null,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase insert department error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("Next.js create department error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
