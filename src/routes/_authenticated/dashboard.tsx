import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard/Shell";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: () => (
    <DashboardShell>
      <Outlet />
    </DashboardShell>
  ),
});
