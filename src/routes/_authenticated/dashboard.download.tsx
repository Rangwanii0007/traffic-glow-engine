import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { ComingSoon } from "@/components/dashboard/ComingSoon";

export const Route = createFileRoute("/_authenticated/dashboard/download")({
  head: () => ({ meta: [{ title: "Download — AD4YOU" }] }),
  component: () => (
    <ComingSoon
      icon={Download}
      title="Download AD4YOU bot"
      description="The Windows installer, system requirements, install guide and changelog ship in the next phase."
    />
  ),
});
