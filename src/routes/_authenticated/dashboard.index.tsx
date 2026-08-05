import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, TrendingUp, Calendar, Award, ArrowRight, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  head: () => ({ meta: [{ title: "Dashboard — AD4YOU" }] }),
  component: OverviewPage,
});

function OverviewPage() {
  const { user, profile } = useAuth();
  const uid = user?.id;

  const subQ = useQuery({
    queryKey: ["my-subscription", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("status, start_date, end_date, duration_days, plans(name, color, price, slug)")
        .eq("user_id", uid!)
        .maybeSingle();
      return data;
    },
  });

  const statsQ = useQuery({
    queryKey: ["session-stats", uid],
    enabled: !!uid,
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const [{ count: total }, { count: todayCount }] = await Promise.all([
        supabase.from("bot_sessions").select("*", { count: "exact", head: true }).eq("user_id", uid!),
        supabase.from("bot_sessions").select("*", { count: "exact", head: true }).eq("user_id", uid!).gte("created_at", today.toISOString()),
      ]);
      return { total: total ?? 0, today: todayCount ?? 0 };
    },
  });

  const recentQ = useQuery({
    queryKey: ["recent-sessions", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase
        .from("bot_sessions")
        .select("id, started_at, urls_count, traffic_source, duration_minutes, status")
        .eq("user_id", uid!)
        .order("started_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  const annQ = useQuery({
    queryKey: ["active-announcement"],
    queryFn: async () => {
      const { data } = await supabase
        .from("announcements")
        .select("id, title, message, type")
        .eq("is_active", true)
        .eq("show_on_web", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const sub = subQ.data;
  const planName = sub?.plans?.name ?? "Free";
  const planColor = sub?.plans?.color ?? "#6b7280";
  const end = sub?.end_date ? new Date(sub.end_date) : null;
  const daysLeft = end ? Math.max(0, Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;
  const isUnlimited = sub?.duration_days === 0;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {annQ.data && (
        <div className="glass-card rounded-2xl p-4 flex items-start gap-3 border border-accent/30 bg-accent/5">
          <Sparkles className="w-5 h-5 text-accent shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-sm">{annQ.data.title}</p>
            <p className="text-sm text-muted-foreground">{annQ.data.message}</p>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Welcome back, {profile?.full_name ?? "Publisher"}!</h1>
        <p className="text-muted-foreground mt-1">Here's what's happening with your account.</p>
      </div>

      {/* current plan card */}
      <div className="glass-card rounded-3xl p-6 sm:p-8 relative overflow-hidden">
        <div
          className="absolute -top-20 -right-20 w-72 h-72 rounded-full blur-3xl opacity-30"
          style={{ background: planColor }}
        />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span
                className="px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase text-white"
                style={{ background: planColor }}
              >
                {planName} Plan
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn("w-2 h-2 rounded-full", sub?.status === "active" ? "bg-success" : "bg-muted-foreground")} />
                {sub?.status ?? "inactive"}
              </span>
            </div>
            {isUnlimited ? (
              <p className="text-2xl font-bold">Unlimited access</p>
            ) : (
              <>
                <p className="text-2xl font-bold">{daysLeft} days remaining</p>
                {end && <p className="text-sm text-muted-foreground">Expires on {end.toLocaleDateString()}</p>}
              </>
            )}
          </div>
          <Button asChild className="bg-gradient-to-r from-primary to-accent text-white">
            <Link to="/dashboard/billing">{sub?.plans?.slug === "free" ? "Upgrade plan" : "Manage plan"}</Link>
          </Button>
        </div>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Activity} label="Total sessions" value={statsQ.isLoading ? null : statsQ.data?.total ?? 0} />
        <StatCard icon={TrendingUp} label="Sessions today" value={statsQ.isLoading ? null : statsQ.data?.today ?? 0} />
        <StatCard icon={Calendar} label="Days remaining" value={isUnlimited ? "∞" : daysLeft} />
        <StatCard icon={Award} label="Current plan" value={planName} />
      </div>

      {/* recent sessions */}
      <div className="glass-card rounded-3xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recent sessions</h2>
          <Link to="/dashboard/sessions" className="text-sm text-primary hover:underline flex items-center gap-1">
            View all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {recentQ.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : recentQ.data?.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No sessions yet. <Link to="/download" className="text-primary hover:underline">Download the bot</Link> to get started.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-2 font-medium">Date</th>
                  <th className="text-left p-2 font-medium">URLs</th>
                  <th className="text-left p-2 font-medium">Source</th>
                  <th className="text-left p-2 font-medium">Duration</th>
                  <th className="text-left p-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentQ.data?.map((s) => (
                  <tr key={s.id} className="border-t border-white/5">
                    <td className="p-2">{new Date(s.started_at!).toLocaleString()}</td>
                    <td className="p-2">{s.urls_count}</td>
                    <td className="p-2 capitalize">{s.traffic_source}</td>
                    <td className="p-2">{s.duration_minutes}m</td>
                    <td className="p-2">
                      <StatusBadge status={s.status ?? "running"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string | number | null }) {
  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      {value === null ? <Skeleton className="h-7 w-16 mt-1" /> : <p className="text-2xl font-bold mt-1">{value}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "bg-success/15 text-success border-success/30",
    running: "bg-warning/15 text-warning border-warning/30",
    failed: "bg-destructive/15 text-destructive border-destructive/30",
  };
  return (
    <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium border capitalize", map[status] ?? map.running)}>
      {status}
    </span>
  );
}
