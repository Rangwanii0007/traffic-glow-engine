import { createFileRoute, Outlet } from "@tanstack/react-router";
import { MemberProvider } from "@/hooks/use-member";
import { TeamShell } from "@/components/team/Shell";

export const Route = createFileRoute("/team")({
  ssr: false,
  component: () => (
    <MemberProvider>
      <TeamShell>
        <Outlet />
      </TeamShell>
    </MemberProvider>
  ),
});
