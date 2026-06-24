import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { ComingSoon } from "@/components/dashboard/ComingSoon";

export const Route = createFileRoute("/_authenticated/dashboard/settings")({
  head: () => ({ meta: [{ title: "Settings — AD4YOU" }] }),
  component: () => (
    <ComingSoon
      icon={Settings}
      title="Account settings"
      description="Profile, password, devices, notifications and danger zone ship in the next phase."
    />
  ),
});
