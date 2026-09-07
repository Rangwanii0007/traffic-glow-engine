import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMember } from "@/hooks/use-member";
import { memberLeaderboard } from "@/lib/member.functions";
import { money, qty } from "@/lib/money";

export const Route = createFileRoute("/team/leaderboard")({
  head: () => ({
    meta: [
      { title: "Team Leaderboard — AD4YOU" },
      { name: "description", content: "Live AD4YOU team leaderboard comparing every member's earnings and completed actions." },
      { property: "og:title", content: "Team Leaderboard — AD4YOU" },
      { property: "og:description", content: "See how your earnings rank against the rest of your team, updated live." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LeaderboardPage,
});

type Period = "today" | "week" | "month" | "all";

function LeaderboardPage() {
  const { token } = useMember();
  const [period, setPeriod] = useState<Period>("month");
  const query = useQuery({
    queryKey: ["member", "leaderboard", period],
    queryFn: () => memberLeaderboard({ data: { token: token!, period } }),
    enabled: !!token,
    refetchInterval: 60000,
  });

  const rows = query.data?.rows ?? [];
  const s = query.data?.rates.currency_symbol ?? "$";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Leaderboard</h1>
        <p className="text-sm text-muted-foreground">{query.data?.teamName ?? "Your team"} — everyone&apos;s progress, side by side.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["today", "week", "month", "all"] as Period[]).map((p) => (
          <Button key={p} size="sm" variant={period === p ? "default" : "outline"} onClick={() => setPeriod(p)} className="capitalize">
            {p === "all" ? "All time" : p}
          </Button>
        ))}
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-3"><Trophy className="w-4 h-4 text-primary" /><h2 className="font-semibold">Ranking</h2></div>
        {query.isLoading ? <Skeleton className="h-56 rounded-xl" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead className="text-xs text-muted-foreground text-left">
                <tr>
                  <th className="p-2">#</th><th className="p-2">Member</th><th className="p-2">Role</th>
                  <th className="p-2">Visits today</th><th className="p-2">Visits total</th><th className="p-2">Ads viewed</th>
                  <th className="p-2">Ads clicked</th><th className="p-2">Hours</th>
                  <th className="p-2 capitalize">Earned {period === "all" ? "all time" : period}</th><th className="p-2">Earned total</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={10} className="p-6 text-center text-xs text-muted-foreground">No team members yet.</td></tr>
                ) : rows.map((r) => (
                  <tr key={r.id} className={`border-t border-white/5 ${r.isMe ? "bg-primary/5" : ""}`}>
                    <td className="p-2 font-semibold">{r.rank}</td>
                    <td className="p-2">
                      <span className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${r.is_online ? "bg-emerald-400" : "bg-white/20"}`} />
                        {r.name}{r.isMe ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">You</span> : null}
                      </span>
                    </td>
                    <td className="p-2 capitalize text-muted-foreground">{r.role.replace("_", " ")}</td>
                    <td className="p-2">{qty(r.activity.visitsToday)}</td>
                    <td className="p-2">{qty(r.activity.visitsTotal)}</td>
                    <td className="p-2">{qty(r.activity.adsViewedTotal)}</td>
                    <td className="p-2">{qty(r.activity.adsClickedTotal)}</td>
                    <td className="p-2">{qty(r.activity.hoursTotal)}</td>
                    <td className="p-2">{money(r.periodEarnings, s)}</td>
                    <td className="p-2 font-medium text-primary">{money(r.totalEarnings, s)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
