import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/team/Shell";
import { useMember } from "@/hooks/use-member";
import { memberPaymentHistory } from "@/lib/member.functions";
import { STATUS_STYLES, money } from "@/lib/money";

export const Route = createFileRoute("/team/payments")({
  head: () => ({
    meta: [
      { title: "Payment History — AD4YOU Team" },
      { name: "description", content: "Every AD4YOU team withdrawal you requested with its status, method, transaction reference and decision notes." },
      { property: "og:title", content: "Payment History — AD4YOU Team" },
      { property: "og:description", content: "Track paid, pending and rejected withdrawals for your team account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentsPage,
});

type Filter = "all" | "pending" | "processing" | "successful" | "rejected";

function PaymentsPage() {
  const { token } = useMember();
  const [filter, setFilter] = useState<Filter>("all");
  const query = useQuery({
    queryKey: ["member", "payments"],
    queryFn: () => memberPaymentHistory({ data: { token: token! } }),
    enabled: !!token,
  });

  const s = query.data?.rates.currency_symbol ?? "$";
  const all = query.data?.withdrawals ?? [];
  const rows = filter === "all" ? all : all.filter((w) => String(w['status']) === filter);
  const sum = (status: string) => all.filter((w) => String(w['status']) === status).reduce((t, w) => t + Number(w['amount'] ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Payment history</h1>
        <p className="text-sm text-muted-foreground">All of your withdrawal requests and their outcome.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Paid out" value={money(sum("successful"), s)} />
        <StatCard label="In review" value={money(sum("pending") + sum("processing"), s)} />
        <StatCard label="Rejected" value={money(sum("rejected"), s)} />
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "pending", "processing", "successful", "rejected"] as Filter[]).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)} className="capitalize">{f}</Button>
        ))}
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-3"><Receipt className="w-4 h-4 text-primary" /><h2 className="font-semibold">Requests</h2></div>
        {query.isLoading ? <Skeleton className="h-48 rounded-xl" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="text-xs text-muted-foreground text-left">
                <tr>
                  <th className="p-2">Requested</th><th className="p-2">Amount</th><th className="p-2">Method</th>
                  <th className="p-2">Status</th><th className="p-2">Decided</th><th className="p-2">Transaction</th><th className="p-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={7} className="p-6 text-center text-xs text-muted-foreground">Nothing here yet.</td></tr>
                ) : rows.map((w, i) => (
                  <tr key={i} className="border-t border-white/5">
                    <td className="p-2 whitespace-nowrap">{w['requested_at'] ? new Date(String(w['requested_at'])).toLocaleString() : "—"}</td>
                    <td className="p-2 font-medium">{money(w['amount'], s)}</td>
                    <td className="p-2">{String(w['method_name'] ?? w['method_slug'] ?? "—")}</td>
                    <td className="p-2">
                      <span className={`text-[11px] px-2 py-1 rounded-full ring-1 ${STATUS_STYLES[String(w['status'])] ?? "bg-white/5 text-muted-foreground ring-white/10"}`}>
                        {String(w['status'])}
                      </span>
                    </td>
                    <td className="p-2 whitespace-nowrap text-muted-foreground">{w['decided_at'] ? new Date(String(w['decided_at'])).toLocaleString() : "—"}</td>
                    <td className="p-2 text-muted-foreground break-all">{String(w['transaction_id'] ?? "—")}</td>
                    <td className="p-2 text-muted-foreground">{String(w['decision_note'] ?? w['rejection_reason'] ?? "—")}</td>
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
