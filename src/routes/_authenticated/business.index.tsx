import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, Coins, Eye, Monitor, MousePointerClick, Timer, Users, Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { NoTeamNotice, useBusiness } from "@/components/business/Shell";
import { getTeamOverview } from "@/lib/team.functions";
import { useTeamRealtime } from "@/hooks/use-team-realtime";

export const Route = createFileRoute("/_authenticated/business/")({
  head: () => ({
    meta: [
      { title: "Business Panel — AD4YOU Team Control" },
      { name: "description", content: "Live overview of your AD4YOU team: members online, PCs, visits, ad views and earnings." },
      { property: "og:title", content: "Business Panel — AD4YOU Team Control" },
      { property: "og:description", content: "Live overview of your AD4YOU team: members online, PCs, visits, ad views and earnings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BusinessOverview,
});

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Users; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="w-4 h-4" />{label}</div>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function BusinessOverview() {
  const { teamId, team } = useBusiness();
  const overview = useQuery({
    queryKey: ["business", "overview", teamId],
    queryFn: () => getTeamOverview({ data: { teamId: teamId! } }),
    enabled: !!teamId,
  });
  useTeamRealtime(teamId, ["team_members", "team_pcs", "team_earnings", "withdrawal_requests"], [["business", "overview", teamId ?? ""]]);

  if (!teamId) return <NoTeamNotice />;

  const d = overview.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{String(team?.['name'] ?? "Team")} overview</h1>
        <p className="text-sm text-muted-foreground">Live numbers straight from every member&apos;s bot.</p>
      </div>

      {overview.isLoading || !d ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat icon={Users} label="Members" value={String(d.members)} hint={`${d.online} online now`} />
            <Stat icon={Monitor} label="PCs registered" value={String(d.pcs)} hint={`${d.pcsOnline} online`} />
            <Stat icon={Activity} label="Visits today" value={d.visitsToday.toLocaleString()} hint={`${d.visitsTotal.toLocaleString()} lifetime`} />
            <Stat icon={Timer} label="Hours today" value={d.hoursToday.toFixed(1)} />
            <Stat icon={Eye} label="Ads viewed today" value={d.adsViewedToday.toLocaleString()} />
            <Stat icon={MousePointerClick} label="Ads clicked today" value={d.adsClickedToday.toLocaleString()} />
            <Stat icon={Coins} label="Earnings today" value={`$${d.earningsToday.toFixed(2)}`} hint={`$${d.earningsTotal.toFixed(2)} lifetime`} />
            <Stat icon={Wallet} label="Pending withdrawals" value={String(d.pendingWithdrawals)} hint={`$${d.pendingAmount.toFixed(2)} requested`} />
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
            <h2 className="font-semibold">Last 14 days</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead className="text-xs text-muted-foreground text-left">
                  <tr><th className="p-2">Date</th><th className="p-2">Visits</th><th className="p-2">Ads viewed</th><th className="p-2">Ads clicked</th><th className="p-2">Hours</th><th className="p-2">Earnings</th></tr>
                </thead>
                <tbody>
                  {d.daily.length === 0 ? (
                    <tr><td colSpan={6} className="p-4 text-center text-muted-foreground text-xs">No session data yet — start the bot on a member PC.</td></tr>
                  ) : d.daily.map((row, i) => (
                    <tr key={i} className="border-t border-white/5">
                      <td className="p-2 whitespace-nowrap">{String(row['date'] ?? "—")}</td>
                      <td className="p-2">{Number(row['visits'] ?? 0).toLocaleString()}</td>
                      <td className="p-2">{Number(row['ads_viewed'] ?? 0).toLocaleString()}</td>
                      <td className="p-2">{Number(row['ads_clicked'] ?? 0).toLocaleString()}</td>
                      <td className="p-2">{Number(row['hours'] ?? 0).toFixed(1)}</td>
                      <td className="p-2 font-medium">${Number(row['earnings'] ?? 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
