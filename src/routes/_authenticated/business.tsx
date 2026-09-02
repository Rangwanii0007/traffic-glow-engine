import { createFileRoute, Outlet } from "@tanstack/react-router";
import { BusinessShell } from "@/components/business/Shell";

export const Route = createFileRoute("/_authenticated/business")({
  component: () => (
    <BusinessShell>
      <Outlet />
    </BusinessShell>
  ),
});
