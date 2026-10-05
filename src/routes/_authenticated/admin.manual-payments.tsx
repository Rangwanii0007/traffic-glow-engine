import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Eye, Image as ImageIcon, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { decideManualPayment, getManualProofUrl, listManualPaymentsAdmin } from "@/lib/manual-payments.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/manual-payments")({
  head: () => ({
    meta: [
      { title: "Manual Payments — AD4YOU Admin" },
      { name: "description", content: "Verify, approve or reject manual payment submissions." },
      { property: "og:title", content: "Manual Payments — AD4YOU Admin" },
      { property: "og:description", content: "Manual payment verification for AD4YOU packages." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManualPaymentsAdmin,
});

const fmt = (n: number, c: string) => { try { return new Intl.NumberFormat(undefined, { style: "currency", currency: c }).format(n); } catch { return `${c} ${n}`; } };

function ManualPaymentsAdmin() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "manual-payments"], queryFn: () => listManualPaymentsAdmin() });
  const [f, setF] = useState({ status: "", country: "", method: "", pkg: "", user: "", from: "" });
  const [detail, setDetail] = useState<Record<string, any> | null>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [proof, setProof] = useState<string | null>(null);
  const [action, setAction] = useState<{ id: string; decision: "approve" | "reject" } | null>(null);
  const [reason, setReason] = useState("");

  const rows = q.data ?? [];
  const filtered = useMemo(() => rows.filter((r) =>
    (!f.status || r.status === f.status) && (!f.country || r.country_name === f.country) && (!f.method || r.method_name === f.method) &&
    (!f.pkg || r.plan_name === f.pkg) && (!f.from || r.created_at >= f.from) &&
    (!f.user || `${r.user?.email ?? ""} ${r.user?.full_name ?? ""}`.toLowerCase().includes(f.user.toLowerCase()))), [rows, f]);
  const uniq = (k: string) => [...new Set(rows.map((r) => String(r[k])))];
  const stat = (s: string) => rows.filter((r) => r.status === s).length;
  const volume = rows.filter((r) => r.status === "approved").reduce((a, r) => a + Number(r.base_price_usd), 0);

  const openProof = async (id: string) => {
    try { setProof((await getManualProofUrl({ data: { id } })).url); } catch (e) { toast.error((e as Error).message); }
  };
  const decide = useMutation({
    mutationFn: () => decideManualPayment({ data: { id: action!.id, decision: action!.decision, reason: reason || undefined } }),
    onSuccess: () => { toast.success(action?.decision === "approve" ? "Approved — subscription activated" : "Payment rejected"); setAction(null); setReason(""); setDetail(null); void qc.invalidateQueries({ queryKey: ["admin", "manual-payments"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const sel = "h-9 rounded-md border border-white/10 bg-background px-2 text-sm";
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Manual payments</h1>
        <p className="text-sm text-muted-foreground">Verify proofs before activating packages. Crypto payments remain under Payments.</p></div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[["Pending", stat("pending")], ["Approved", stat("approved")], ["Rejected", stat("rejected")], ["Approved volume", fmt(volume, "USD")]].map(([l, v]) => (
          <div key={String(l)} className="glass-card rounded-2xl p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="text-2xl font-bold">{v}</p></div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <select className={sel} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select>
        <select className={sel} value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })}><option value="">All countries</option>{uniq("country_name").map((v) => <option key={v}>{v}</option>)}</select>
        <select className={sel} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}><option value="">All methods</option>{uniq("method_name").map((v) => <option key={v}>{v}</option>)}</select>
        <select className={sel} value={f.pkg} onChange={(e) => setF({ ...f, pkg: e.target.value })}><option value="">All packages</option>{uniq("plan_name").map((v) => <option key={v}>{v}</option>)}</select>
        <Input type="date" className="w-40" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        <Input className="w-52" placeholder="Search user" value={f.user} onChange={(e) => setF({ ...f, user: e.target.value })} />
      </div>

      <div className="glass-card rounded-2xl p-4 overflow-x-auto">
        {q.isLoading ? <Skeleton className="h-40" /> : q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : (
          <table className="w-full text-sm min-w-[1100px]">
            <thead className="text-xs text-muted-foreground text-left"><tr>
              {["User", "Package", "Base", "Method", "Country", "Local amount", "Transaction ID", "Proof", "Submitted", "Status", ""].map((h) => <th key={h} className="p-2 font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">No submissions.</td></tr> : filtered.map((r) => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="p-2">{r.user?.full_name ?? "—"}<span className="block text-[11px] text-muted-foreground">{r.user?.email}</span></td>
                  <td className="p-2">{r.package_label}</td>
                  <td className="p-2">{fmt(Number(r.base_price_usd), "USD")}</td>
                  <td className="p-2">{r.method_name}</td>
                  <td className="p-2">{r.country_name}</td>
                  <td className="p-2 font-medium">{fmt(Number(r.local_amount), r.currency_code)}</td>
                  <td className="p-2 font-mono text-xs">{r.transaction_id}</td>
                  <td className="p-2"><Button size="sm" variant="outline" onClick={() => openProof(r.id)}><ImageIcon className="w-3.5 h-3.5" />View</Button></td>
                  <td className="p-2 text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="p-2"><span className={cn("text-[11px] px-2 py-0.5 rounded-full ring-1 capitalize", r.status === "approved" ? "bg-success/15 text-success ring-success/30" : r.status === "rejected" ? "bg-destructive/15 text-destructive ring-destructive/30" : "bg-warning/15 text-warning ring-warning/30")}>{r.status}</span></td>
                  <td className="p-2"><Button size="sm" variant="ghost" onClick={() => setDetail(r)}><Eye className="w-3.5 h-3.5" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Payment details</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-2 text-sm">
                {[["User", detail.user?.email], ["Package", detail.package_label], ["Duration", `${detail.duration_days} days`], ["Base price", fmt(Number(detail.base_price_usd), "USD")],
                  ["Method", detail.method_name], ["Country", detail.country_name], ["Rate", `1 USD = ${detail.exchange_rate} ${detail.currency_code}`], ["Rate source", detail.rate_source],
                  ["Amount", fmt(Number(detail.local_amount), detail.currency_code)], ["Transaction ID", detail.transaction_id], ["Status", detail.status],
                  ["Reviewed", detail.approved_at ?? detail.rejected_at ?? "—"], ["Reason", detail.rejection_reason ?? "—"]].map(([k, v]) => (
                  <Fragment key={String(k)}><dt className="text-muted-foreground">{k}</dt><dd className="break-all">{String(v ?? "—")}</dd></Fragment>
                ))}
              </dl>
              <Button variant="outline" className="w-full" onClick={() => openProof(detail.id)}><ImageIcon className="w-4 h-4" />View Screenshot</Button>
              {detail.status === "pending" && (
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => setAction({ id: detail.id, decision: "approve" })}><CheckCircle2 className="w-4 h-4" />Approve Payment</Button>
                  <Button className="flex-1" variant="destructive" onClick={() => setAction({ id: detail.id, decision: "reject" })}><XCircle className="w-4 h-4" />Reject Payment</Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!proof} onOpenChange={(o) => !o && setProof(null)}>
        <DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Payment screenshot</DialogTitle></DialogHeader>
          {proof && <img src={proof} alt="Payment proof" className="max-h-[75vh] mx-auto rounded-lg" />}</DialogContent>
      </Dialog>

      <Dialog open={!!action} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{action?.decision === "approve" ? "Approve this payment?" : "Reject this payment?"}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{action?.decision === "approve" ? "The user's selected package will be activated (or extended) immediately." : "The user will see your reason. No package is activated."}</p>
          {action?.decision === "reject" && <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Payment could not be verified. Please carefully check your payment details and submit a valid payment." />}
          <Button disabled={decide.isPending} variant={action?.decision === "reject" ? "destructive" : "default"} onClick={() => decide.mutate()}>
            {decide.isPending && <Loader2 className="animate-spin" />}Confirm
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
