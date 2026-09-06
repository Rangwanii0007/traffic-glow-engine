import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Calculator, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useMember } from "@/hooks/use-member";
import { memberDashboard } from "@/lib/member.functions";
import { money, qty } from "@/lib/money";

export const Route = createFileRoute("/team/earning-info")({
  head: () => ({
    meta: [
      { title: "Earning Information — AD4YOU Team" },
      { name: "description", content: "See exactly how your AD4YOU team earnings are calculated: rate per ad view, ad click, visit and task." },
      { property: "og:title", content: "Earning Information — AD4YOU Team" },
      { property: "og:description", content: "Transparent breakdown of the rates your team owner set and how your balance is built." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EarningInfo,
});

function EarningInfo() {
  const { token } = useMember();
  const query = useQuery({
    queryKey: ["member", "earning-info"],
    queryFn: () => memberDashboard({ data: { token: token! } }),
    enabled: !!token,
  });

  if (query.isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (query.error) return <p className="text-sm text-red-300">{(query.error as Error).message}</p>;
  const d = query.data!;
  const r = d.rates;
  const s = r.currency_symbol;

  const lines = [
    { label: "Ad view", rate: r.per_ad_view_rate, count: d.adViews, amount: d.adViewEarnings },
    { label: "Ad click", rate: r.per_ad_click_rate, count: d.adClicks, amount: d.adClickEarnings },
    { label: "Website visit", rate: r.per_visit_rate, count: d.visits, amount: d.visitEarnings },
    { label: "Task / point", rate: r.per_point_rate, count: d.tasks, amount: d.taskEarnings },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Earning information</h1>
        <p className="text-sm text-muted-foreground">These are the live rates your team owner set. Every credit below uses them.</p>
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4"><Calculator className="w-4 h-4 text-primary" /><h2 className="font-semibold">How your balance is calculated</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead className="text-xs text-muted-foreground text-left">
              <tr><th className="p-2">Action</th><th className="p-2">Your rate</th><th className="p-2">Done so far</th><th className="p-2">Earned</th></tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.label} className="border-t border-white/5">
                  <td className="p-2">{l.label}</td>
                  <td className="p-2">{money(l.rate, s)}</td>
                  <td className="p-2">{qty(l.count)}</td>
                  <td className="p-2 text-primary font-medium">{money(l.amount, s)}</td>
                </tr>
              ))}
              <tr className="border-t border-white/10">
                <td className="p-2 font-medium">Bonus / manual credits</td>
                <td className="p-2 text-muted-foreground">×{r.bonus_multiplier}</td>
                <td className="p-2">—</td>
                <td className="p-2 text-primary font-medium">{money(d.otherEarnings, s)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3"><p className="text-xs text-muted-foreground">Total earned</p><p className="font-bold">{money(d.totalEarnings, s)}</p></div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3"><p className="text-xs text-muted-foreground">Withdrawn / on hold</p><p className="font-bold">{money(d.paidAmount + d.pendingAmount, s)}</p></div>
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3"><p className="text-xs text-muted-foreground">Available now</p><p className="font-bold text-primary">{money(d.balance, s)}</p></div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6 space-y-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 text-foreground font-semibold"><Info className="w-4 h-4 text-primary" />Rules</div>
        <p>Minimum withdrawal: <span className="text-foreground font-medium">{money(r.min_withdrawal, s)}</span> ({r.currency_code}).</p>
        <p>Earnings are credited from your software activity automatically; your owner can also add manual bonuses.</p>
        <p>When you request a withdrawal the amount is held from your balance until it is paid or rejected.</p>
        {r.admin_notes ? <p className="text-foreground whitespace-pre-line pt-2">{r.admin_notes}</p> : null}
      </section>
    </div>
  );
}
