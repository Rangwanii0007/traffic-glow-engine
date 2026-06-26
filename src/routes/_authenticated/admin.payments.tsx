import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/payments")({
  head: () => ({ meta: [{ title: "Admin · Payments — AD4YOU" }] }),
  component: PaymentsAdmin,
});

function PaymentsAdmin() {
  const q = useQuery({
    queryKey: ["admin-payments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("id, amount, currency, crypto_type, status, nowpayments_id, created_at, confirmed_at, user_id, plan_id, users(email), plans(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
        <p className="text-muted-foreground mt-1">All NOWPayments transactions.</p>
      </div>

      <div className="glass-card rounded-3xl p-6 overflow-x-auto">
        {q.isLoading ? <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div> : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-2 font-medium">When</th>
                <th className="text-left p-2 font-medium">User</th>
                <th className="text-left p-2 font-medium">Plan</th>
                <th className="text-left p-2 font-medium">Amount</th>
                <th className="text-left p-2 font-medium">Crypto</th>
                <th className="text-left p-2 font-medium">Status</th>
                <th className="text-left p-2 font-medium">NP ID</th>
              </tr>
            </thead>
            <tbody>
              {q.data?.map((p) => {
                const u = Array.isArray(p.users) ? p.users[0] : p.users;
                const pl = Array.isArray(p.plans) ? p.plans[0] : p.plans;
                return (
                  <tr key={p.id} className="border-t border-white/5">
                    <td className="p-2 text-xs text-muted-foreground">{p.created_at ? new Date(p.created_at).toLocaleString() : "—"}</td>
                    <td className="p-2 font-mono text-xs">{u?.email ?? p.user_id?.slice(0, 8)}</td>
                    <td className="p-2">{pl?.name ?? "—"}</td>
                    <td className="p-2">${Number(p.amount).toFixed(2)} {p.currency}</td>
                    <td className="p-2 uppercase text-xs">{p.crypto_type ?? "—"}</td>
                    <td className="p-2">
                      <span className={cn("px-2 py-0.5 rounded-md text-xs font-medium border capitalize",
                        p.status === "confirmed" ? "bg-success/15 text-success border-success/30"
                        : p.status === "failed" ? "bg-destructive/15 text-destructive border-destructive/30"
                        : "bg-warning/15 text-warning border-warning/30")}>{p.status}</span>
                    </td>
                    <td className="p-2 font-mono text-[10px] text-muted-foreground">{p.nowpayments_id ?? "—"}</td>
                  </tr>
                );
              })}
              {q.data?.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No payments yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
