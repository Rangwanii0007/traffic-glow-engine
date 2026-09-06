import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Plus, Save, Trash2, Wallet, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  adminDecideMemberWithdrawal, deletePayoutMethod, listAllMemberWithdrawals, listPayoutMethodsAdmin, savePayoutMethod,
} from "@/lib/payout-methods.functions";
import { STATUS_STYLES, money } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/admin/payout-methods")({
  head: () => ({
    meta: [
      { title: "Payout Methods — AD4YOU Admin" },
      { name: "description", content: "Create and manage the withdrawal methods team members can choose, and review every payout request." },
      { property: "og:title", content: "Payout Methods — AD4YOU Admin" },
      { property: "og:description", content: "Dynamic payout methods and platform-wide member withdrawal control." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PayoutMethodsPage,
});

type Field = { key: string; label: string; type: "text" | "email" | "number"; required: boolean; placeholder?: string };
type Form = {
  id: string | null; name: string; slug: string; is_active: boolean; instructions: string;
  min_amount: number; sort_order: number; fields: Field[];
};

const blank: Form = { id: null, name: "", slug: "", is_active: true, instructions: "", min_amount: 0, sort_order: 0, fields: [] };

function PayoutMethodsPage() {
  const qc = useQueryClient();
  const methods = useQuery({ queryKey: ["admin", "payout-methods"], queryFn: () => listPayoutMethodsAdmin() });
  const requests = useQuery({ queryKey: ["admin", "member-withdrawals"], queryFn: () => listAllMemberWithdrawals() });

  const [form, setForm] = useState<Form | null>(null);
  const [target, setTarget] = useState<{ id: string; decision: "successful" | "rejected" } | null>(null);
  const [reason, setReason] = useState("");
  const [txn, setTxn] = useState("");

  const save = useMutation({
    mutationFn: () => savePayoutMethod({ data: { ...form!, instructions: form!.instructions || undefined } }),
    onSuccess: () => { toast.success("Payout method saved"); setForm(null); void qc.invalidateQueries({ queryKey: ["admin", "payout-methods"] }); },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deletePayoutMethod({ data: { id } }),
    onSuccess: () => { toast.success("Method removed"); void qc.invalidateQueries({ queryKey: ["admin", "payout-methods"] }); },
    onError: (error: Error) => toast.error(error.message),
  });

  const decide = useMutation({
    mutationFn: () =>
      adminDecideMemberWithdrawal({ data: { id: target!.id, decision: target!.decision, reason: reason || undefined, transactionId: txn || undefined } }),
    onSuccess: () => { toast.success("Request updated"); setTarget(null); setReason(""); setTxn(""); void qc.invalidateQueries({ queryKey: ["admin", "member-withdrawals"] }); },
    onError: (error: Error) => toast.error(error.message),
  });

  const setField = (i: number, patch: Partial<Field>) =>
    setForm((f) => (f ? { ...f, fields: f.fields.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) } : f));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Payout methods</h1>
          <p className="text-sm text-muted-foreground">Whatever you add here is exactly what team members can choose when withdrawing.</p>
        </div>
        <Button onClick={() => setForm({ ...blank })}><Plus className="w-4 h-4" />New method</Button>
      </div>

      {methods.isLoading ? <Skeleton className="h-48 rounded-2xl" /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(methods.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No methods yet — add PayPal, bank transfer, crypto or anything else you support.</p>
          ) : (methods.data ?? []).map((m) => {
            const fields = Array.isArray(m['fields']) ? (m['fields'] as unknown as Field[]) : [];
            return (
              <div key={String(m['id'])} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{String(m['name'])}</p>
                    <p className="text-[11px] text-muted-foreground">{String(m['slug'])}</p>
                  </div>
                  <span className={`text-[11px] px-2 py-1 rounded-full ring-1 ${m['is_active'] ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" : "bg-white/5 text-muted-foreground ring-white/10"}`}>
                    {m['is_active'] ? "active" : "hidden"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Minimum {money(m['min_amount'])}</p>
                <p className="text-xs text-muted-foreground">Fields: {fields.map((f) => f.label).join(", ") || "none"}</p>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => setForm({
                    id: String(m['id']), name: String(m['name'] ?? ""), slug: String(m['slug'] ?? ""),
                    is_active: Boolean(m['is_active']), instructions: String(m['instructions'] ?? ""),
                    min_amount: Number(m['min_amount'] ?? 0), sort_order: Number(m['sort_order'] ?? 0), fields,
                  })}>Edit</Button>
                  <Button size="sm" variant="ghost" className="text-red-300" onClick={() => remove.mutate(String(m['id']))}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-3"><Wallet className="w-4 h-4 text-primary" /><h2 className="font-semibold">All member withdrawal requests</h2></div>
        {requests.isLoading ? <Skeleton className="h-40 rounded-xl" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead className="text-xs text-muted-foreground text-left">
                <tr><th className="p-2">Requested</th><th className="p-2">Member</th><th className="p-2">Amount</th><th className="p-2">Method</th><th className="p-2">Status</th><th className="p-2"></th></tr>
              </thead>
              <tbody>
                {(requests.data ?? []).length === 0 ? (
                  <tr><td colSpan={6} className="p-6 text-center text-xs text-muted-foreground">No requests yet.</td></tr>
                ) : (requests.data ?? []).map((w) => {
                  const status = String(w['status']);
                  const member = w.member as Record<string, unknown> | null;
                  return (
                    <tr key={String(w['id'])} className="border-t border-white/5">
                      <td className="p-2 whitespace-nowrap">{w['requested_at'] ? new Date(String(w['requested_at'])).toLocaleString() : "—"}</td>
                      <td className="p-2">{String(member?.['name'] ?? "Member")}<span className="block text-[11px] text-muted-foreground">{String(member?.['email'] ?? "")}</span></td>
                      <td className="p-2 font-medium">{money(w['amount'])}</td>
                      <td className="p-2">{String(w['method_name'] ?? w['method_slug'] ?? "—")}</td>
                      <td className="p-2"><span className={`text-[11px] px-2 py-1 rounded-full ring-1 ${STATUS_STYLES[status] ?? "bg-white/5 text-muted-foreground ring-white/10"}`}>{status}</span></td>
                      <td className="p-2">
                        {status === "pending" || status === "processing" ? (
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" onClick={() => { setReason(""); setTxn(""); setTarget({ id: String(w['id']), decision: "successful" }); }}>
                              <CheckCircle2 className="w-3.5 h-3.5" />Paid
                            </Button>
                            <Button size="sm" variant="ghost" className="text-red-300" onClick={() => { setReason(""); setTxn(""); setTarget({ id: String(w['id']), decision: "rejected" }); }}>
                              <XCircle className="w-3.5 h-3.5" />Reject
                            </Button>
                          </div>
                        ) : <span className="text-[11px] text-muted-foreground">Closed</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form?.id ? "Edit payout method" : "New payout method"}</DialogTitle></DialogHeader>
          {form ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label className="text-xs">Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, slug: form.slug || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") })} placeholder="PayPal" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Slug</Label>
                  <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="paypal" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Minimum amount</Label>
                  <Input type="number" step="0.01" min={0} value={form.min_amount} onChange={(e) => setForm({ ...form, min_amount: Number(e.target.value) })} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Sort order</Label>
                  <Input type="number" min={0} value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Instructions for members</Label>
                <Textarea rows={3} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></div>
              <div className="flex items-center justify-between rounded-xl border border-white/10 p-3">
                <span className="text-sm">Visible to members</span>
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Details to collect</Label>
                  <Button size="sm" variant="outline" onClick={() => setForm({ ...form, fields: [...form.fields, { key: "", label: "", type: "text", required: true }] })}>
                    <Plus className="w-3.5 h-3.5" />Add field
                  </Button>
                </div>
                {form.fields.map((f, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] items-center rounded-xl border border-white/10 p-2">
                    <Input placeholder="label e.g. PayPal email" value={f.label}
                      onChange={(e) => setField(i, { label: e.target.value, key: f.key || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") })} />
                    <Input placeholder="key e.g. paypal_email" value={f.key} onChange={(e) => setField(i, { key: e.target.value })} />
                    <label className="flex items-center gap-2 text-xs px-1">
                      <input type="checkbox" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} />required
                    </label>
                    <Button size="sm" variant="ghost" className="text-red-300" onClick={() => setForm({ ...form, fields: form.fields.filter((_, idx) => idx !== i) })}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              <Button className="w-full" disabled={save.isPending}
                onClick={() => {
                  if (!form.name.trim() || !form.slug.trim()) return toast.error("Name and slug are required");
                  if (form.fields.some((f) => !f.key.trim() || !f.label.trim())) return toast.error("Every field needs a label and a key");
                  save.mutate();
                }}>
                {save.isPending ? <Loader2 className="animate-spin" /> : <Save className="w-4 h-4" />}Save method
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{target?.decision === "rejected" ? "Reject request" : "Mark as paid"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {target?.decision === "successful" ? (
              <div className="space-y-1.5"><Label className="text-xs">Transaction reference (optional)</Label>
                <Input value={txn} onChange={(e) => setTxn(e.target.value)} /></div>
            ) : null}
            <div className="space-y-1.5">
              <Label className="text-xs">{target?.decision === "rejected" ? "Reason (shown to the member)" : "Note (optional)"}</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <Button className="w-full" disabled={decide.isPending}
              onClick={() => { if (target?.decision === "rejected" && !reason.trim()) return toast.error("Please enter a reason"); decide.mutate(); }}>
              {decide.isPending ? <Loader2 className="animate-spin" /> : null}Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
