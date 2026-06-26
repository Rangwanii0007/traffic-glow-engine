import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users, CreditCard, Activity, HelpCircle, TrendingUp, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Admin Overview — AD4YOU" }] }),
  component: AdminOverview,
});

function AdminOverview() {
  const stats = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [users, subs, payments, tickets, sessions, revenue] = await Promise.all([
        supabase.from("users").select("*", { count: "exact", head: true }),
        supabase.from("subscriptions").select("*", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("payments").select("*", { count: "exact", head: true }).eq("status", "confirmed"),
        supabase.from("support_tickets").select("*", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("bot_sessions").select("*", { count: "exact", head: true }),
        supabase.from("payments").select("amount").eq("status", "confirmed"),
      ]);
      const totalRevenue = (revenue.data ?? []).reduce((s, p: { amount: number | null }) => s + (Number(p.amount) || 0), 0);
      return {
        users: users.count ?? 0,
        activeSubs: subs.count ?? 0,
        payments: payments.count ?? 0,
        openTickets: tickets.count ?? 0,
        sessions: sessions.count ?? 0,
        revenue: totalRevenue,
      };
    },
  });

  const cards = [
    { label: "Total Users", value: stats.data?.users, icon: Users, color: "from-primary to-accent" },
    { label: "Active Subscriptions", value: stats.data?.activeSubs, icon: TrendingUp, color: "from-success to-primary" },
    { label: "Confirmed Payments", value: stats.data?.payments, icon: CreditCard, color: "from-accent to-warning" },
    { label: "Total Revenue", value: stats.data ? `$${stats.data.revenue.toFixed(2)}` : undefined, icon: DollarSign, color: "from-warning to-destructive" },
    { label: "Bot Sessions", value: stats.data?.sessions, icon: Activity, color: "from-primary to-accent" },
    { label: "Open Tickets", value: stats.data?.openTickets, icon: HelpCircle, color: "from-destructive to-warning" },
  ];

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Overview</h1>
        <p className="text-muted-foreground mt-1">Platform health at a glance.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="glass-card rounded-3xl p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">{label}</span>
              <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${color} grid place-content-center`}><Icon className="w-4 h-4 text-white" /></div>
            </div>
            {stats.isLoading ? <Skeleton className="h-9 w-24" /> : <p className="text-3xl font-bold">{value}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
