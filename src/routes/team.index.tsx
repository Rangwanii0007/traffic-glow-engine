import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, MousePointerClick, Eye, Wallet, Globe, Trophy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/team/Shell";
import { useMember } from "@/hooks/use-member";
import { memberDashboard } from "@/lib/member.functions";
import { ENTRY_LABELS, STATUS_STYLES, money, qty } from "@/lib/money";

export const Route = createFileRoute("/team/")({
  head: () => ({
    meta: [
      { title: "Team Dashboard — AD4YOU" },
      { name: "description", content: "Your live AD4YOU team dashboard: balance, ad views, ad clicks, visits, earnings and payout status." },
      { property: "og:title", content: "Team Dashboard — AD4YOU" },
      { property: "og:description", content: "Live earnings, activity and payout status for AD4YOU team members." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamDashboard,
});

function TeamDashboard() {
  const { token } = useMember();
  const query = useQuery({
    queryKey: ["member", "dashboard"],
    queryFn: () => memberDashboard({ data: { token: token! } }),
    enabled: !!token,
    refetchInterval: 30000,
  });

  if (query.isLoading) {
    return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>;
  }
  if (query.error) return <p className="text-sm text-red-300">{(query.error as Error).message}</p>;
  const d = query.data!;
  const s = d.rates.currency_symbol;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Hi {String(d.member['name'] ?? "there")}</h1>
          <p className="text-sm text-muted-foreground">
            {d.team.company_name ?? d.team.name} · {String(d.member['role'] ?? "member").replace("_", " ")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm"><Link to="/team/withdraw"><Wallet className="w-4 h-4" />Withdraw</Link></Button>
          <Button asChild size="sm" variant="outline"><Link to="/team/leaderboard"><Trophy className="w-4 h-4" />Leaderboard</Link></Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Available balance" value={money(d.balance, s)} hint={`Minimum withdrawal ${money(d.rates.min_withdrawal, s)}`} />
        <StatCard label="Total earned" value={money(d.totalEarnings, s)} />
        <StatCard label="Pending payouts" value={money(d.pendingAmount, s)} hint={`${d.withdrawalCount} request(s)`} />
        <StatCard label="Paid out" value={money(d.paidAmount, s)} />
        <StatCard label="Today" value={money(d.todayEarnings, s)} />
        <StatCard label="This week" value={money(d.weekEarnings, s)} />
        <StatCard label="This month" value={money(d.monthEarnings, s)} />
        <StatCard label="Bonus / manual" value={money(d.otherEarnings, s)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Eye, label: "Ad views", count: d.adViews, amount: d.adViewEarnings, on: d.rates.ad_view_enabled },
          { icon: MousePointerClick, label: "Ad clicks", count: d.adClicks, amount: d.adClickEarnings, on: d.rates.ad_click_enabled },
          { icon: Globe, label: "Website visits", count: d.visits, amount: d.visitEarnings, on: d.rates.visit_enabled },
          { icon: Activity, label: "Tasks / points", count: d.tasks, amount: d.taskEarnings, on: d.rates.point_enabled },
        ].filter((c) => c.on !== false).map(({ icon: Icon, label, count, amount }) => (

          <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="w-4 h-4 text-primary" />{label}</div>
            <p className="text-xl font-bold mt-2">{qty(count)}</p>
            <p className="text-xs text-primary">{money(amount, s)} earned</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
          <h2 className="font-semibold mb-3">Recent activity</h2>
          {d.recentActivity.length === 0 ? (
            <p className="text-xs text-muted-foreground">No activity yet. Start the bot in your software and it will appear here.</p>
          ) : (
            <ul className="space-y-2">
              {d.recentActivity.map((e, i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-sm border-b border-white/5 pb-2 last:border-0">
                  <span>
                    {ENTRY_LABELS[String(e['entry_type'])] ?? String(e['entry_type'])}
                    <span className="text-muted-foreground"> · {qty(e['quantity'])}</span>
                  </span>
                  <span className="text-right">
                    <span className="text-primary font-medium">{money(e['amount'], s)}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {e['occurred_at'] ? new Date(String(e['occurred_at'])).toLocaleString() : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
          <h2 className="font-semibold mb-3">Recent payouts</h2>
          {d.recentPayments.length === 0 ? (
            <p className="text-xs text-muted-foreground">No withdrawal requests yet.</p>
          ) : (
            <ul className="space-y-2">
              {d.recentPayments.map((w, i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-sm border-b border-white/5 pb-2 last:border-0">
                  <span>
                    {money(w['amount'], s)}
                    <span className="block text-[11px] text-muted-foreground">{String(w['method_name'] ?? w['method_slug'] ?? "")}</span>
                  </span>
                  <span className={`text-[11px] px-2 py-1 rounded-full ring-1 ${STATUS_STYLES[String(w['status'])] ?? "bg-white/5 text-muted-foreground ring-white/10"}`}>
                    {String(w['status'])}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {d.rates.admin_notes ? (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm">
          <p className="font-medium mb-1">Message from your team owner</p>
          <p className="text-muted-foreground whitespace-pre-line">{d.rates.admin_notes}</p>
        </div>
      ) : null}
    </div>
  );
}
