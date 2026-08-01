"use client";

import DashboardPanel from "../components/sentinel/DashboardPanel";
import CalendarPanel from "../components/sentinel/CalendarPanel";

export default function DashboardPage() {
  return (
    <div style={{ width: "100%" }}>
      <DashboardPanel />
      <div className="px-4 pb-8">
        <CalendarPanel />
      </div>
    </div>
  );
}
