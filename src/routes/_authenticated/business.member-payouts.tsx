import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Wallet, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NoTeamNotice, useBusiness } from "@/components/business/Shell";
import { decideMemberWithdrawal, listMemberWithdrawals } from "@/lib/team-earnings.functions";
import { STATUS_STYLES, money } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/business/member-payouts")({
  head: () => ({
    meta: [
      { title: "Member Payouts — AD4YOU Business Panel" },
      { name: "description", content: "Approve, pay or reject the withdrawal requests your AD4YOU team members send." },
      { property: "og:title", content: "Member Payouts — AD4YOU Business Panel" },
      { property: "og:description", content: "Review every team member withdrawal request with full payment details." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MemberPayoutsPage,
});

type Decision = "processing" | "successful" | "rejected";

function MemberPayoutsPage() {
  const { teamId } = useBusiness();
  const qc = useQueryClient();
  const key = ["business", "member-payouts", teamId ?? ""];
  const query = useQuery({
    queryKey: key,
    queryFn: () => listMemberWithdrawals({ data: { teamId: teamId! } }),
    enabled: !!teamId,
    refetchInterval: 60000,
  });

  const [target, setTarget] = useState<{ id: string; decision: Decision } | null>(null);
  const [reason, setReason] = useState("");
  const [txn, setTxn] = useState("");

  const decide = useMutation({
    mutationFn: (input: { id: string; decision: Decision }) =>
      decideMemberWithdrawal({
        data: { teamId: teamId!, id: input.id, decision: input.decision, reason: reason || undefined, transactionId: txn || undefined },
      }),
    onSuccess: () => { toast.success("Request updated"); setTarget(null); setReason(""); setTxn(""); void qc.invalidateQueries({ queryKey: key }); },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!teamId) return <NoTeamNotice />;
  const s = query.data?.rates.currency_symbol ?? "$";
  const rows = query.data?.rows ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Member payouts</h1>
        <p className="text-sm text-muted-foreground">Requested amounts are already held from the member&apos;s balance. Rejecting returns them instantly.</p>
      </div>

      {query.isLoading ? <Skeleton className="h-64 rounded-2xl" /> : (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-3"><Wallet className="w-4 h-4 text-primary" /><h2 className="font-semibold">Requests</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="text-xs text-muted-foreground text-left">
                <tr>
                  <th className="p-2">Requested</th><th className="p-2">Member</th><th className="p-2">Amount</th><th className="p-2">Method</th>
                  <th className="p-2">Payment details</th><th className="p-2">Status</th><th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={7} className="p-6 text-center text-xs text-muted-foreground">No withdrawal requests yet.</td></tr>
                ) : rows.map((w) => {
                  const status = String(w['status']);
                  const details = (w['details'] ?? {}) as Record<string, unknown>;
                  const member = w.member as Record<string, unknown> | null;
                  return (
                    <tr key={String(w['id'])} className="border-t border-white/5 align-top">
                      <td className="p-2 whitespace-nowrap">{w['requested_at'] ? new Date(String(w['requested_at'])).toLocaleString() : "—"}</td>
                      <td className="p-2">
                        {String(member?.['name'] ?? "Member")}
                        <span className="block text-[11px] text-muted-foreground">{String(member?.['email'] ?? "")}</span>
                      </td>
                      <td className="p-2 font-medium">{money(w['amount'], s)}</td>
                      <td className="p-2">{String(w['method_name'] ?? w['method_slug'] ?? "—")}</td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {Object.entries(details).length === 0 ? "—" : Object.entries(details).map(([k, v]) => (
                          <span key={k} className="block">{k}: <span className="text-foreground break-all">{String(v)}</span></span>
                        ))}
                      </td>
                      <td className="p-2">
                        <span className={`text-[11px] px-2 py-1 rounded-full ring-1 ${STATUS_STYLES[status] ?? "bg-white/5 text-muted-foreground ring-white/10"}`}>{status}</span>
                        {w['transaction_id'] ? <span className="block text-[11px] text-muted-foreground mt-1 break-all">{String(w['transaction_id'])}</span> : null}
                      </td>
                      <td className="p-2">
                        {status === "pending" || status === "processing" ? (
                          <div className="flex flex-col gap-1 items-stretch">
                            {status === "pending" ? (
                              <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: String(w['id']), decision: "processing" })}>
                                Mark processing
                              </Button>
                            ) : null}
                            <Button size="sm" onClick={() => { setTxn(""); setReason(""); setTarget({ id: String(w['id']), decision: "successful" }); }}>
                              <CheckCircle2 className="w-3.5 h-3.5" />Mark paid
                            </Button>
                            <Button size="sm" variant="ghost" className="text-red-300" onClick={() => { setTxn(""); setReason(""); setTarget({ id: String(w['id']), decision: "rejected" }); }}>
                              <XCircle className="w-3.5 h-3.5" />Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">{String(w['decision_note'] ?? w['rejection_reason'] ?? "Closed")}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{target?.decision === "rejected" ? "Reject request" : "Mark request as paid"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {target?.decision === "successful" ? (
              <div className="space-y-1.5"><Label className="text-xs">Transaction reference (optional)</Label>
                <Input value={txn} onChange={(e) => setTxn(e.target.value)} placeholder="PayPal / bank / crypto reference" /></div>
            ) : null}
            <div className="space-y-1.5">
              <Label className="text-xs">{target?.decision === "rejected" ? "Reason (shown to the member)" : "Note (optional)"}</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <Button
              className="w-full"
              disabled={decide.isPending}
              onClick={() => {
                if (target?.decision === "rejected" && !reason.trim()) return toast.error("Please enter a reason");
                decide.mutate({ id: target!.id, decision: target!.decision });
              }}
            >
              {decide.isPending ? <Loader2 className="animate-spin" /> : null}Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
