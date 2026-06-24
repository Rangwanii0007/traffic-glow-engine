import { createFileRoute } from "@tanstack/react-router";
import { HelpCircle } from "lucide-react";
import { ComingSoon } from "@/components/dashboard/ComingSoon";

export const Route = createFileRoute("/_authenticated/dashboard/support")({
  head: () => ({ meta: [{ title: "Support — AD4YOU" }] }),
  component: () => (
    <ComingSoon
      icon={HelpCircle}
      title="Support tickets"
      description="Ticket creation and admin chat thread ship in the next phase."
    />
  ),
});
