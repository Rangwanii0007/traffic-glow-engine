import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/team/Shell";
import { useMember } from "@/hooks/use-member";
import { memberEarningHistory } from "@/lib/member.functions";
import { ENTRY_LABELS, money, qty } from "@/lib/money";

export const Route = createFileRoute("/team/earnings")({
  head: () => ({
    meta: [
      { title: "My Earnings — AD4YOU Team" },
      { name: "description", content: "Full earning history for your AD4YOU team account, filtered by day, week, month or a custom date range." },
      { property: "og:title", content: "My Earnings — AD4YOU Team" },
      { property: "og:description", content: "Every ad view, ad click, visit and bonus credited to your team account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EarningsHistory,
});

type Preset = "today" | "week" | "month" | "all" | "custom";

function rangeFor(preset: Preset, from: string, to: string) {
  const now = new Date();
  if (preset === "today") return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString() };
  if (preset === "week") {
    const day = (now.getDay() + 6) % 7;
    return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate() - day).toISOString() };
  }
  if (preset === "month") return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString() };
  if (preset === "custom") {
    return {
      ...(from ? { from: new Date(`${from}T00:00:00`).toISOString() } : {}),
      ...(to ? { to: new Date(`${to}T23:59:59`).toISOString() } : {}),
    };
  }
  return {};
}

function EarningsHistory() {
  const { token } = useMember();
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const range = useMemo(() => rangeFor(preset, from, to), [preset, from, to]);
  const query = useQuery({
    queryKey: ["member", "earnings", preset, from, to],
    queryFn: () => memberEarningHistory({ data: { token: token!, ...range } }),
    enabled: !!token,
  });

  const entries = query.data?.entries ?? [];
  const s = query.data?.rates.currency_symbol ?? "$";
  const total = entries.reduce((t, e) => t + Number(e['amount'] ?? 0), 0);
  const units = entries.reduce((t, e) => t + Number(e['quantity'] ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">My earnings</h1>
        <p className="text-sm text-muted-foreground">Every credit is calculated from your team owner&apos;s live rates.</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {(["today", "week", "month", "all", "custom"] as Preset[]).map((p) => (
            <Button key={p} size="sm" variant={preset === p ? "default" : "outline"} onClick={() => setPreset(p)} className="capitalize">
              {p === "all" ? "All time" : p}
            </Button>
          ))}
        </div>
        {preset === "custom" ? (
          <div className="grid gap-3 sm:grid-cols-2 max-w-md">
            <div className="space-y-1.5"><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Earned in this range" value={money(total, s)} />
        <StatCard label="Total actions" value={qty(units)} />
        <StatCard label="Entries" value={qty(entries.length)} />
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-3"><CalendarRange className="w-4 h-4 text-primary" /><h2 className="font-semibold">Earning history</h2></div>
        {query.isLoading ? <Skeleton className="h-48 rounded-xl" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[620px]">
              <thead className="text-xs text-muted-foreground text-left">
                <tr><th className="p-2">Date</th><th className="p-2">Type</th><th className="p-2">Actions</th><th className="p-2">Rate</th><th className="p-2">Amount</th><th className="p-2">Source</th></tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr><td colSpan={6} className="p-6 text-center text-xs text-muted-foreground">Nothing recorded in this period.</td></tr>
                ) : entries.map((e, i) => (
                  <tr key={i} className="border-t border-white/5">
                    <td className="p-2 whitespace-nowrap">{e['occurred_at'] ? new Date(String(e['occurred_at'])).toLocaleString() : "—"}</td>
                    <td className="p-2">{ENTRY_LABELS[String(e['entry_type'])] ?? String(e['entry_type'])}</td>
                    <td className="p-2">{qty(e['quantity'])}</td>
                    <td className="p-2 text-muted-foreground">{e['unit_rate'] ? money(e['unit_rate'], s) : "—"}</td>
                    <td className="p-2 font-medium text-primary">{money(e['amount'], s)}</td>
                    <td className="p-2 text-muted-foreground capitalize">{String(e['source'] ?? "bot").replace("_", " ")}</td>
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
