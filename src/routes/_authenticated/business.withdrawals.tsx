import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Ban, Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { NoTeamNotice, useBusiness } from "@/components/business/Shell";
import { decideWithdrawal, listTeamWithdrawals } from "@/lib/team.functions";
import { useTeamRealtime } from "@/hooks/use-team-realtime";

export const Route = createFileRoute("/_authenticated/business/withdrawals")({
  head: () => ({
    meta: [
      { title: "Withdrawals — AD4YOU Business Panel" },
      { name: "description", content: "Approve, reject and mark team withdrawal requests as paid with transaction references." },
      { property: "og:title", content: "Withdrawals — AD4YOU Business Panel" },
      { property: "og:description", content: "Approve, reject and mark team withdrawal requests as paid with transaction references." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WithdrawalsPage,
});

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-300",
  approved: "bg-sky-500/15 text-sky-300",
  paid: "bg-emerald-500/15 text-emerald-300",
  rejected: "bg-destructive/15 text-destructive",
};

function WithdrawalsPage() {
  const { teamId } = useBusiness();
  const qc = useQueryClient();
  const key = ["business", "withdrawals", teamId ?? ""];
  const query = useQuery({ queryKey: key, queryFn: () => listTeamWithdrawals({ data: { teamId: teamId! } }), enabled: !!teamId });
  useTeamRealtime(teamId, ["withdrawal_requests"], [key]);

  const [notes, setNotes] = useState<Record<string, string>>({});
  const [txn, setTxn] = useState<Record<string, string>>({});

  const decide = useMutation({
    mutationFn: (vars: { id: string; decision: "approved" | "rejected" | "paid" }) =>
      decideWithdrawal({
        data: { teamId: teamId!, id: vars.id, decision: vars.decision, note: notes[vars.id] || undefined, transactionId: txn[vars.id] || undefined },
      }),
    onSuccess: () => { toast.success("Request updated"); qc.invalidateQueries({ queryKey: key }); },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!teamId) return <NoTeamNotice />;

  const rows = query.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Withdrawals</h1>
        <p className="text-sm text-muted-foreground">Requests come straight from the software. Approve, then mark paid once you send the money.</p>
      </div>

      {query.isLoading ? <Skeleton className="h-40 rounded-2xl" /> : rows.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-muted-foreground">
          No withdrawal requests yet.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((raw) => {
            const r = raw as unknown as Record<string, string | number | null> & { member?: { name?: string; email?: string } | null };
            const id = String(r['id']);
            const status = String(r['status'] ?? "pending");
            return (
              <div key={id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Wallet className="w-4 h-4 text-primary" />
                  <div className="flex-1 min-w-40">
                    <p className="font-semibold">{r.member?.name ?? "Member"}</p>
                    <p className="text-xs text-muted-foreground">{r.member?.email ?? "—"} · {String(r['method'] ?? r['payment_method'] ?? "—")}</p>
                  </div>
                  <p className="text-lg font-bold">${Number(r['amount'] ?? 0).toFixed(2)}</p>
                  <span className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded-full ${STATUS_STYLES[status] ?? "bg-white/10"}`}>{status}</span>
                  <span className="text-xs text-muted-foreground">
                    {r['created_at'] ? new Date(String(r['created_at'])).toLocaleString() : ""}
                  </span>
                </div>

                {(r['payment_details'] || r['account_details']) && (
                  <p className="text-xs text-muted-foreground break-all">
                    {String(r['payment_details'] ?? r['account_details'])}
                  </p>
                )}

                {status !== "paid" && status !== "rejected" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input className="w-full sm:w-56" placeholder="Note for the member"
                      value={notes[id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [id]: e.target.value }))} />
                    {status === "approved" && (
                      <Input className="w-full sm:w-52" placeholder="Transaction ID"
                        value={txn[id] ?? ""} onChange={(e) => setTxn((t) => ({ ...t, [id]: e.target.value }))} />
                    )}
                    {status === "pending" && (
                      <>
                        <Button size="sm" onClick={() => decide.mutate({ id, decision: "approved" })} disabled={decide.isPending}>
                          {decide.isPending ? <Loader2 className="animate-spin" /> : <BadgeCheck className="w-4 h-4" />}Approve
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => decide.mutate({ id, decision: "rejected" })} disabled={decide.isPending}>
                          <Ban className="w-4 h-4" />Reject
                        </Button>
                      </>
                    )}
                    {status === "approved" && (
                      <Button size="sm" onClick={() => decide.mutate({ id, decision: "paid" })} disabled={decide.isPending}>
                        {decide.isPending ? <Loader2 className="animate-spin" /> : <BadgeCheck className="w-4 h-4" />}Mark paid
                      </Button>
                    )}
                  </div>
                )}

                {r['admin_notes'] && <p className="text-xs text-muted-foreground">Note: {String(r['admin_notes'])}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
