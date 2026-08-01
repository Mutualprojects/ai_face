"use client";

import { useRouter } from "next/navigation";
import VisitorsPanel from "../components/sentinel/VisitorsPanel";

export default function VisitorsPage() {
  const router = useRouter();

  return (
    <div style={{ width: "100%" }}>
      <VisitorsPanel
        onSuccess={() => {
          router.push("/dashboard");
        }}
      />
    </div>
  );
}
