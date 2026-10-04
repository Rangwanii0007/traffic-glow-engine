import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Globe, Loader2, Plus, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteCountry, listPaymentSetupAdmin, saveCountry, saveManualMethod, toggleManualMethod, uploadMethodLogo } from "@/lib/manual-payments.functions";

export const Route = createFileRoute("/_authenticated/admin/manual-methods")({
  head: () => ({
    meta: [
      { title: "Manual Payment Methods — AD4YOU Admin" },
      { name: "description", content: "Manage countries and manual payment methods shown at checkout." },
      { property: "og:title", content: "Manual Payment Methods — AD4YOU Admin" },
      { property: "og:description", content: "Country-based manual payment method management." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MethodsAdmin,
});

const DETAIL_KEYS: [string, string][] = [
  ["account_name", "Account holder / name"], ["bank_name", "Bank name"], ["account_number", "Account number"], ["iban", "IBAN"],
  ["branch", "Branch information"], ["paypal_email", "PayPal email"], ["payoneer_account", "Payoneer account"], ["binance_uid", "Binance UID"],
  ["crypto_coin", "Crypto coin"], ["crypto_network", "Crypto network"], ["wallet_address", "Wallet address"], ["reference_info", "Other reference"],
];
const CATS = ["local", "bank", "wallet", "paypal", "payoneer", "binance", "crypto", "other"] as const;
type M = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const blankMethod: M = { id: null, name: "", category: "local", logo_url: "", currency_code: "USD", instructions: "", is_active: true, sort_order: 0, countryIds: [] };
const blankCountry: M = { id: null, name: "", code: "", flag: "", logo_url: "", currency_code: "USD", currency_symbol: "$", is_active: true, sort_order: 0 };

const readB64 = (file: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });

function MethodsAdmin() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "manual-setup"], queryFn: () => listPaymentSetupAdmin() });
  const [method, setMethod] = useState<M | null>(null);
  const [country, setCountry] = useState<M | null>(null);
  const [uploading, setUploading] = useState(false);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["admin", "manual-setup"] });
  const onErr = (e: Error) => toast.error(e.message);

  const saveM = useMutation({
    mutationFn: () => {
      const d: M = { ...method! };
      for (const [k] of DETAIL_KEYS) d[k] = d[k] ?? "";
      d.logo_url = d.logo_url ?? ""; d.instructions = d.instructions ?? "";
      return saveManualMethod({ data: d as never });
    },
    onSuccess: () => { toast.success("Method saved"); setMethod(null); refresh(); }, onError: onErr,
  });
  const saveC = useMutation({ mutationFn: () => saveCountry({ data: country as never }), onSuccess: () => { toast.success("Country saved"); setCountry(null); refresh(); }, onError: onErr });
  const delC = useMutation({ mutationFn: (id: string) => deleteCountry({ data: { id } }), onSuccess: refresh, onError: onErr });
  const toggle = useMutation({ mutationFn: (d: { id: string; is_active?: boolean; is_archived?: boolean; sort_order?: number }) => toggleManualMethod({ data: d }), onSuccess: refresh, onError: onErr });

  if (q.isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message} — run AD4YOU_MANUAL_PAYMENTS.sql first.</p>;
  const { countries, methods, links } = q.data!;
  const countriesOf = (id: string) => links.filter((l) => l.method_id === id).map((l) => l.country_id);
  const active = methods.filter((m) => m.is_active && !m.is_archived).length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Manual payment methods</h1>
          <p className="text-sm text-muted-foreground">Only active methods in active countries appear to users.</p></div>
        <Button onClick={() => setMethod({ ...blankMethod })}><Plus className="w-4 h-4" />Add Payment Method</Button>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[["Active methods", active], ["Inactive / archived", methods.length - active], ["Countries", countries.filter((c) => c.is_active).length], ["Currencies", new Set(methods.map((m) => m.currency_code)).size]].map(([l, v]) => (
          <div key={String(l)} className="glass-card rounded-2xl p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="text-2xl font-bold">{v}</p></div>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold">Methods</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {methods.length === 0 && <p className="text-sm text-muted-foreground">No methods yet.</p>}
          {methods.map((m) => (
            <div key={m.id} className={`glass-card rounded-2xl p-4 space-y-2 ${m.is_archived ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-3">
                {m.logo_url ? <img src={m.logo_url} alt="" className="w-10 h-10 rounded-lg object-contain bg-white/5" /> : <div className="w-10 h-10 rounded-lg bg-primary/20 grid place-content-center font-bold">{String(m.name).slice(0, 2)}</div>}
                <div className="flex-1 min-w-0"><p className="font-semibold truncate">{m.name}</p><p className="text-[11px] text-muted-foreground">{m.category} · {m.currency_code} · order {m.sort_order}</p></div>
                <Switch checked={m.is_active} disabled={m.is_archived} onCheckedChange={(v) => toggle.mutate({ id: m.id, is_active: v })} />
              </div>
              <p className="text-xs text-muted-foreground">{countriesOf(m.id).map((id) => { const c = countries.find((x) => x.id === id); return c ? `${c.flag ?? ""} ${c.name}` : ""; }).join(", ") || "No countries"}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setMethod({ ...m, countryIds: countriesOf(m.id) })}>Edit</Button>
                <Input type="number" className="h-8 w-16" defaultValue={m.sort_order} onBlur={(e) => Number(e.target.value) !== m.sort_order && toggle.mutate({ id: m.id, sort_order: Number(e.target.value) })} />
                {m.is_archived
                  ? <Button size="sm" variant="ghost" onClick={() => toggle.mutate({ id: m.id, is_archived: false })}>Restore</Button>
                  : <Button size="sm" variant="ghost" className="text-destructive" onClick={() => toggle.mutate({ id: m.id, is_archived: true })}><Archive className="w-3.5 h-3.5" />Archive</Button>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="font-semibold flex items-center gap-2"><Globe className="w-4 h-4" />Countries</h2>
          <Button size="sm" variant="outline" onClick={() => setCountry({ ...blankCountry })}><Plus className="w-3.5 h-3.5" />Add country</Button></div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {countries.map((c) => (
            <div key={c.id} className="rounded-xl border border-white/10 p-3 flex items-center justify-between gap-2 text-sm">
              <div><p className="font-medium">{c.flag} {c.name}</p><p className="text-[11px] text-muted-foreground">{c.code} · {c.currency_symbol} {c.currency_code} · {c.is_active ? "active" : "hidden"}</p></div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setCountry({ ...c, flag: c.flag ?? "", logo_url: c.logo_url ?? "" })}>Edit</Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => confirm(`Delete ${c.name}?`) && delC.mutate(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Dialog open={!!method} onOpenChange={(o) => !o && setMethod(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{method?.id ? "Edit payment method" : "New payment method"}</DialogTitle></DialogHeader>
          {method && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label className="text-xs">Method name</Label><Input value={method.name} onChange={(e) => setMethod({ ...method, name: e.target.value })} placeholder="Easypaisa" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Type</Label>
                  <select className="h-9 w-full rounded-md border border-white/10 bg-background px-2 text-sm" value={method.category} onChange={(e) => setMethod({ ...method, category: e.target.value })}>
                    {CATS.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
                <div className="space-y-1.5"><Label className="text-xs">Currency (3 letters)</Label><Input value={method.currency_code} onChange={(e) => setMethod({ ...method, currency_code: e.target.value.toUpperCase() })} maxLength={3} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Display order</Label><Input type="number" value={method.sort_order} onChange={(e) => setMethod({ ...method, sort_order: Number(e.target.value) })} /></div>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Logo</Label>
                <div className="flex items-center gap-2">
                  {method.logo_url && <img src={method.logo_url} alt="" className="w-10 h-10 rounded object-contain bg-white/5" />}
                  <label className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-md border border-white/10 cursor-pointer hover:bg-white/5">
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}Upload
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0]; if (!file) return;
                      setUploading(true);
                      try { const { url } = await uploadMethodLogo({ data: { type: file.type, base64: await readB64(file) } }); setMethod((m) => m && { ...m, logo_url: url }); }
                      catch (err) { toast.error((err as Error).message); } finally { setUploading(false); }
                    }} />
                  </label>
                </div></div>
              <div className="space-y-1.5"><Label className="text-xs">Countries</Label>
                <div className="flex flex-wrap gap-2">{countries.map((c) => {
                  const on = method.countryIds.includes(c.id);
                  return <button key={c.id} type="button" onClick={() => setMethod({ ...method, countryIds: on ? method.countryIds.filter((x: string) => x !== c.id) : [...method.countryIds, c.id] })}
                    className={`text-xs px-2 py-1 rounded-full ring-1 ${on ? "bg-primary/20 ring-primary/50" : "ring-white/10"}`}>{c.flag} {c.name}</button>;
                })}</div></div>
              <p className="text-xs text-muted-foreground">Fill only the details that apply — empty fields are hidden from users.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {DETAIL_KEYS.map(([k, l]) => (
                  <div key={k} className="space-y-1.5"><Label className="text-xs">{l}</Label><Input value={method[k] ?? ""} onChange={(e) => setMethod({ ...method, [k]: e.target.value })} /></div>
                ))}
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Payment instructions</Label><Textarea rows={3} value={method.instructions ?? ""} onChange={(e) => setMethod({ ...method, instructions: e.target.value })} /></div>
              <div className="flex items-center justify-between rounded-xl border border-white/10 p-3"><span className="text-sm">Active</span><Switch checked={method.is_active} onCheckedChange={(v) => setMethod({ ...method, is_active: v })} /></div>
              <Button className="w-full" disabled={saveM.isPending} onClick={() => saveM.mutate()}>{saveM.isPending ? <Loader2 className="animate-spin" /> : <Save className="w-4 h-4" />}Save method</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!country} onOpenChange={(o) => !o && setCountry(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{country?.id ? "Edit country" : "New country"}</DialogTitle></DialogHeader>
          {country && (
            <div className="space-y-3">
              <div className="grid gap-3 grid-cols-2">
                {[["name", "Country name"], ["code", "Country code"], ["flag", "Flag emoji"], ["logo_url", "Flag image URL (optional)"], ["currency_code", "Currency code"], ["currency_symbol", "Currency symbol"]].map(([k, l]) => (
                  <div key={k} className="space-y-1.5"><Label className="text-xs">{l}</Label><Input value={country[k] ?? ""} onChange={(e) => setCountry({ ...country, [k]: e.target.value })} /></div>
                ))}
                <div className="space-y-1.5"><Label className="text-xs">Order</Label><Input type="number" value={country.sort_order} onChange={(e) => setCountry({ ...country, sort_order: Number(e.target.value) })} /></div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-white/10 p-3"><span className="text-sm">Active</span><Switch checked={country.is_active} onCheckedChange={(v) => setCountry({ ...country, is_active: v })} /></div>
              <Button className="w-full" disabled={saveC.isPending} onClick={() => saveC.mutate()}>{saveC.isPending && <Loader2 className="animate-spin" />}Save country</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
