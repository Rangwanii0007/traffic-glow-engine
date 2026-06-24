import { createFileRoute } from "@tanstack/react-router";
import { Activity } from "lucide-react";
import { ComingSoon } from "@/components/dashboard/ComingSoon";

export const Route = createFileRoute("/_authenticated/dashboard/sessions")({
  head: () => ({ meta: [{ title: "Sessions — AD4YOU" }] }),
  component: () => (
    <ComingSoon
      icon={Activity}
      title="My sessions"
      description="Filterable session history with stats and pagination ships in the next phase."
    />
  ),
});
