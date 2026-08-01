import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { CheckCircle2, HandCoins, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listAdminWithdrawals, releaseWithdrawal } from "@/lib/account.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/payouts")({
  head: () => ({
    meta: [
      { title: "Affiliate Payouts — AD4YOU Admin" },
      { name: "description", content: "Review and release AD4YOU affiliate withdrawal requests." },
      { property: "og:title", content: "Affiliate Payouts — AD4YOU Admin" },
      { property: "og:description", content: "Review and release AD4YOU affiliate withdrawal requests." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AffiliatePayoutsAdmin,
});

type Payout = {
  id: string;
  user_id: string;
  amount: number;
  method: string;
  method_details: unknown;
  status: string | null;
  admin_notes: string | null;
  created_at: string | null;
  processed_at: string | null;
  users: { email: string; full_name: string } | { email: string; full_name: string }[] | null;
};

function AffiliatePayoutsAdmin() {
  const qc = useQueryClient();
  const payouts = useQuery({ queryKey: ["admin-withdrawals"], queryFn: () => listAdminWithdrawals() });
  const release = useMutation({
    mutationFn: (id: string) => releaseWithdrawal({ data: { id } }),
    onSuccess: () => {
      toast.success("Payout marked released");
      qc.invalidateQueries({ queryKey: ["admin-withdrawals"] });
      qc.invalidateQueries({ queryKey: ["affiliate", "withdrawals"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const pending = payouts.data?.filter((p) => p.status === "pending") ?? [];
  const history = payouts.data?.filter((p) => p.status !== "pending") ?? [];

  const renderRow = (payout: Payout) => {
    const account = Array.isArray(payout.users) ? payout.users[0] : payout.users;
    const details = payout.method_details && typeof payout.method_details === "object" && !Array.isArray(payout.method_details)
      ? payout.method_details
      : {};
    return (
      <tr key={payout.id} className="border-t border-white/5 align-top">
        <td className="p-3"><p className="font-medium">{account?.full_name ?? "Member"}</p><p className="text-xs text-muted-foreground">{account?.email ?? payout.user_id}</p></td>
        <td className="p-3 font-semibold">${Number(payout.amount).toFixed(2)}</td>
        <td className="p-3 capitalize">{payout.method.replaceAll("_", " ")}</td>
        <td className="p-3 text-xs text-muted-foreground max-w-72 break-words">{Object.entries(details).map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`).join(" · ") || "—"}</td>
        <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{payout.created_at ? new Date(payout.created_at).toLocaleString() : "—"}</td>
        <td className="p-3">
          {payout.status === "pending" ? (
            <Button size="sm" onClick={() => release.mutate(payout.id)} disabled={release.isPending}>
              {release.isPending && release.variables === payout.id ? <Loader2 className="animate-spin" /> : <HandCoins />}
              Release
            </Button>
          ) : (
            <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium capitalize", payout.status === "completed" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
              {payout.status === "completed" && <CheckCircle2 />}{payout.status}
            </span>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-8 max-w-7xl">
      <div><h1 className="text-3xl font-bold">Affiliate Payouts</h1><p className="mt-1 text-muted-foreground">Release verified requests and review confirmed payout history.</p></div>
      {payouts.isLoading ? <Skeleton className="h-52" /> : payouts.isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive">{(payouts.error as Error).message}</div>
      ) : (
        <>
          <PayoutTable title={`Pending requests (${pending.length})`} rows={pending} renderRow={renderRow} empty="No pending payout requests." />
          <PayoutTable title="Released history" rows={history} renderRow={renderRow} empty="No released payouts yet." />
        </>
      )}
    </div>
  );
}

function PayoutTable({ title, rows, renderRow, empty }: { title: string; rows: Payout[]; renderRow: (row: Payout) => ReactNode; empty: string }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <div className="glass-card overflow-x-auto rounded-lg p-4">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="p-3">Member</th><th className="p-3">Amount</th><th className="p-3">Method</th><th className="p-3">Payout details</th><th className="p-3">Requested</th><th className="p-3">Status</th></tr></thead>
          <tbody>{rows.map(renderRow)}{rows.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">{empty}</td></tr>}</tbody>
        </table>
      </div>
    </section>
  );
}