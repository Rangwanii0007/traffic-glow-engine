import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/sessions")({
  head: () => ({ meta: [{ title: "Admin · Sessions — AD4YOU" }] }),
  component: SessionsAdmin,
});

function SessionsAdmin() {
  const q = useQuery({
    queryKey: ["admin-sessions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("bot_sessions")
        .select("id, started_at, ended_at, urls_count, traffic_source, duration_minutes, status, user_id, users(email)")
        .order("started_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Bot Sessions</h1>
        <p className="text-muted-foreground mt-1">Last 200 sessions across all users.</p>
      </div>
      <div className="glass-card rounded-3xl p-6 overflow-x-auto">
        {q.isLoading ? <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div> : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-2 font-medium">Started</th>
                <th className="text-left p-2 font-medium">User</th>
                <th className="text-left p-2 font-medium">URLs</th>
                <th className="text-left p-2 font-medium">Source</th>
                <th className="text-left p-2 font-medium">Duration</th>
                <th className="text-left p-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {q.data?.map((s) => {
                const u = Array.isArray(s.users) ? s.users[0] : s.users;
                return (
                  <tr key={s.id} className="border-t border-white/5">
                    <td className="p-2 text-xs">{s.started_at ? new Date(s.started_at).toLocaleString() : "—"}</td>
                    <td className="p-2 font-mono text-xs">{u?.email ?? s.user_id?.slice(0, 8)}</td>
                    <td className="p-2">{s.urls_count ?? 0}</td>
                    <td className="p-2 capitalize">{s.traffic_source ?? "—"}</td>
                    <td className="p-2">{s.duration_minutes ?? 0}m</td>
                    <td className="p-2">
                      <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium border capitalize",
                        s.status === "completed" ? "bg-success/15 text-success border-success/30"
                        : s.status === "failed" ? "bg-destructive/15 text-destructive border-destructive/30"
                        : "bg-warning/15 text-warning border-warning/30")}>{s.status ?? "running"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
