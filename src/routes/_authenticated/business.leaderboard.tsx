import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { NoTeamNotice, useBusiness } from "@/components/business/Shell";
import { getLeaderboard } from "@/lib/team.functions";
import { useTeamRealtime } from "@/hooks/use-team-realtime";

export const Route = createFileRoute("/_authenticated/business/leaderboard")({
  head: () => ({
    meta: [
      { title: "Team Leaderboard — AD4YOU Business Panel" },
      { name: "description", content: "Rank every worker by visits, ad views, hours and earnings in real time." },
      { property: "og:title", content: "Team Leaderboard — AD4YOU Business Panel" },
      { property: "og:description", content: "Rank every worker by visits, ad views, hours and earnings in real time." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const { teamId } = useBusiness();
  const key = ["business", "leaderboard", teamId ?? ""];
  const query = useQuery({ queryKey: key, queryFn: () => getLeaderboard({ data: { teamId: teamId! } }), enabled: !!teamId });
  useTeamRealtime(teamId, ["team_members"], [key]);

  if (!teamId) return <NoTeamNotice />;

  const rows = query.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Leaderboard</h1>
        <p className="text-sm text-muted-foreground">Everyone in the team can see these numbers — healthy competition, live.</p>
      </div>

      {query.isLoading ? <Skeleton className="h-64 rounded-2xl" /> : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="text-xs text-muted-foreground text-left">
              <tr>
                <th className="p-3">#</th><th className="p-3">Member</th><th className="p-3">Visits today</th>
                <th className="p-3">Visits total</th><th className="p-3">Ads viewed</th><th className="p-3">Ads clicked</th>
                <th className="p-3">Hours</th><th className="p-3">Earned today</th><th className="p-3">Earned total</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={9} className="p-6 text-center text-xs text-muted-foreground">No member activity yet.</td></tr>
              ) : rows.map((raw, i) => {
                const r = raw as Record<string, string | number | boolean | null>;
                return (
                  <tr key={String(r['id'] ?? i)} className="border-t border-white/5">
                    <td className="p-3">
                      {i < 3 ? <Trophy className={`w-4 h-4 ${i === 0 ? "text-yellow-400" : i === 1 ? "text-slate-300" : "text-amber-600"}`} /> : i + 1}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${r['is_online'] ? "bg-emerald-400" : "bg-white/20"}`} />
                        <span className="font-medium">{String(r['name'] ?? r['member_name'] ?? "Member")}</span>
                        <span className="text-[10px] uppercase text-muted-foreground">{String(r['role'] ?? "").replaceAll("_", " ")}</span>
                      </div>
                    </td>
                    <td className="p-3">{Number(r['visits_today'] ?? 0).toLocaleString()}</td>
                    <td className="p-3">{Number(r['visits_total'] ?? 0).toLocaleString()}</td>
                    <td className="p-3">{Number(r['ads_viewed_total'] ?? r['ads_viewed_today'] ?? 0).toLocaleString()}</td>
                    <td className="p-3">{Number(r['ads_clicked_total'] ?? r['ads_clicked_today'] ?? 0).toLocaleString()}</td>
                    <td className="p-3">{Number(r['hours_lifetime'] ?? r['hours_today'] ?? 0).toFixed(1)}</td>
                    <td className="p-3">${Number(r['calculated_earnings_today'] ?? 0).toFixed(2)}</td>
                    <td className="p-3 font-semibold">${Number(r['calculated_earnings_total'] ?? 0).toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
