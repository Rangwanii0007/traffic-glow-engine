import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Monitor, ScrollText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { NoTeamNotice, useBusiness } from "@/components/business/Shell";
import { listTeamActivity } from "@/lib/team.functions";
import { useTeamRealtime } from "@/hooks/use-team-realtime";

export const Route = createFileRoute("/_authenticated/business/activity")({
  head: () => ({
    meta: [
      { title: "Activity & PCs — AD4YOU Business Panel" },
      { name: "description", content: "See every registered PC, member login session and action taken across your team." },
      { property: "og:title", content: "Activity & PCs — AD4YOU Business Panel" },
      { property: "og:description", content: "See every registered PC, member login session and action taken across your team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ActivityPage,
});

function when(value: unknown) {
  return value ? new Date(String(value)).toLocaleString() : "—";
}

function ActivityPage() {
  const { teamId } = useBusiness();
  const key = ["business", "activity", teamId ?? ""];
  const query = useQuery({ queryKey: key, queryFn: () => listTeamActivity({ data: { teamId: teamId! } }), enabled: !!teamId });
  useTeamRealtime(teamId, ["team_activity_logs", "member_sessions", "team_pcs"], [key]);

  if (!teamId) return <NoTeamNotice />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Activity &amp; PCs</h1>
        <p className="text-sm text-muted-foreground">Full audit trail of what your team is doing and which machines are running.</p>
      </div>

      {query.isLoading ? <Skeleton className="h-64 rounded-2xl" /> : (
        <>
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-3"><Monitor className="w-4 h-4 text-primary" /><h2 className="font-semibold">Registered PCs</h2></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(query.data?.pcs ?? []).length === 0 && <p className="text-xs text-muted-foreground">No PCs have connected yet.</p>}
              {(query.data?.pcs ?? []).map((raw, i) => {
                const p = raw as Record<string, string | number | boolean | null>;
                return (
                  <div key={String(p['id'] ?? i)} className="rounded-xl bg-white/5 p-3 text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${p['is_online'] ? "bg-emerald-400" : "bg-white/20"}`} />
                      <span className="font-medium">{String(p['pc_name'] ?? p['device_name'] ?? "PC")}</span>
                    </div>
                    <p className="text-muted-foreground">{String(p['member_name'] ?? p['member_id'] ?? "—")}</p>
                    <p className="text-muted-foreground">Last seen {when(p['last_heartbeat'])}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-3"><ScrollText className="w-4 h-4 text-primary" /><h2 className="font-semibold">Recent activity</h2></div>
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {(query.data?.logs ?? []).length === 0 && <p className="text-xs text-muted-foreground">Nothing logged yet.</p>}
              {(query.data?.logs ?? []).map((raw, i) => {
                const l = raw as Record<string, string | number | null>;
                return (
                  <div key={String(l['id'] ?? i)} className="flex flex-wrap gap-2 items-baseline text-xs border-b border-white/5 pb-2">
                    <span className="font-medium">{String(l['member_name'] ?? "System")}</span>
                    <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary">{String(l['action'] ?? "")}</span>
                    <span className="text-muted-foreground flex-1 min-w-32">{String(l['details'] ?? "")}</span>
                    <span className="text-muted-foreground">{when(l['created_at'])}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
            <h2 className="font-semibold mb-3">Login sessions</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="text-xs text-muted-foreground text-left">
                  <tr><th className="p-2">Member</th><th className="p-2">PC</th><th className="p-2">Login</th><th className="p-2">Logout</th><th className="p-2">Visits</th></tr>
                </thead>
                <tbody>
                  {(query.data?.sessions ?? []).length === 0 ? (
                    <tr><td colSpan={5} className="p-4 text-center text-xs text-muted-foreground">No sessions yet.</td></tr>
                  ) : (query.data?.sessions ?? []).map((raw, i) => {
                    const s = raw as Record<string, string | number | null>;
                    return (
                      <tr key={String(s['id'] ?? i)} className="border-t border-white/5">
                        <td className="p-2">{String(s['member_name'] ?? "—")}</td>
                        <td className="p-2">{String(s['pc_name'] ?? "—")}</td>
                        <td className="p-2 whitespace-nowrap">{when(s['login_time'])}</td>
                        <td className="p-2 whitespace-nowrap">{when(s['logout_time'])}</td>
                        <td className="p-2">{Number(s['visits'] ?? 0).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
