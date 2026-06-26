import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard/sessions")({
  head: () => ({ meta: [{ title: "My Sessions — AD4YOU" }] }),
  component: SessionsPage,
});

const PAGE_SIZE = 20;

function SessionsPage() {
  const { user } = useAuth();
  const uid = user?.id;
  const [page, setPage] = useState(0);

  const q = useQuery({
    queryKey: ["sessions", uid, page],
    enabled: !!uid,
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count } = await supabase
        .from("bot_sessions")
        .select("id, started_at, ended_at, urls_count, traffic_source, duration_minutes, status", { count: "exact" })
        .eq("user_id", uid!)
        .order("started_at", { ascending: false })
        .range(from, to);
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Sessions</h1>
        <p className="text-muted-foreground mt-1">All bot runs synced from your desktop app.</p>
      </div>

      <div className="glass-card rounded-3xl p-6">
        {q.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : q.data?.rows.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">No sessions yet. Run the bot to see data here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-2 font-medium">Started</th>
                  <th className="text-left p-2 font-medium">Ended</th>
                  <th className="text-left p-2 font-medium">URLs</th>
                  <th className="text-left p-2 font-medium">Source</th>
                  <th className="text-left p-2 font-medium">Duration</th>
                  <th className="text-left p-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {q.data?.rows.map((s) => (
                  <tr key={s.id} className="border-t border-white/5">
                    <td className="p-2">{s.started_at ? new Date(s.started_at).toLocaleString() : "—"}</td>
                    <td className="p-2">{s.ended_at ? new Date(s.ended_at).toLocaleString() : "—"}</td>
                    <td className="p-2">{s.urls_count ?? 0}</td>
                    <td className="p-2 capitalize">{s.traffic_source ?? "—"}</td>
                    <td className="p-2">{s.duration_minutes ?? 0}m</td>
                    <td className="p-2">
                      <span className={cn(
                        "px-2 py-0.5 rounded-md text-xs font-medium border capitalize",
                        s.status === "completed" ? "bg-success/15 text-success border-success/30"
                        : s.status === "failed" ? "bg-destructive/15 text-destructive border-destructive/30"
                        : "bg-warning/15 text-warning border-warning/30"
                      )}>{s.status ?? "running"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="flex justify-between items-center mt-4 text-sm">
            <span className="text-muted-foreground">Page {page + 1} of {pages} · {total} total</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</Button>
              <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
