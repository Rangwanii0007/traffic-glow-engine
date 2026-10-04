import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, Copy, Loader2, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getManualCheckout, getManualQuote, listMyManualPayments, submitManualPayment } from "@/lib/manual-payments.functions";
import { cn } from "@/lib/utils";

type Search = { plan?: string; option?: string };

export const Route = createFileRoute("/_authenticated/dashboard/payments")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    plan: typeof s.plan === "string" ? s.plan : undefined,
    option: typeof s.option === "string" ? s.option : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Manual Payment & History — AD4YOU" },
      { name: "description", content: "Pay for your AD4YOU package with local bank, wallet, PayPal or crypto and track your payments." },
      { property: "og:title", content: "Manual Payment & History — AD4YOU" },
      { property: "og:description", content: "Country-based manual payments with live currency conversion." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentsPage,
});

const DETAIL_FIELDS: [string, string][] = [
  ["account_name", "Account name"], ["bank_name", "Bank name"], ["account_number", "Account number"],
  ["iban", "IBAN"], ["branch", "Branch"], ["paypal_email", "PayPal email"], ["payoneer_account", "Payoneer account"],
  ["binance_uid", "Binance UID"], ["crypto_coin", "Coin"], ["crypto_network", "Network"],
  ["wallet_address", "Wallet address"], ["reference_info", "Reference"],
];

const fmt = (n: number, c: string) => {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: c, maximumFractionDigits: 2 }).format(n); }
  catch { return `${c} ${n.toFixed(2)}`; }
};

function CopyValue({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={() => { void navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); }}
      className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 ring-1 ring-white/10 shrink-0">
      {done ? <><CheckCircle2 className="w-3 h-3 text-success" />Copied ✓</> : <><Copy className="w-3 h-3" />Copy</>}
    </button>
  );
}

function PaymentsPage() {
  const { plan, option } = Route.useSearch();
  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground">Manual payments are verified by our team before your package activates.</p>
      </div>
      {plan ? <ManualCheckout planId={plan} optionId={option ?? null} /> : (
        <div className="glass-card rounded-2xl p-5 text-sm text-muted-foreground">
          To pay manually, choose a package on <Link to="/dashboard/billing" className="text-primary underline">Billing & Plans</Link> and select “Pay manually”.
        </div>
      )}
      <History />
    </div>
  );
}

function ManualCheckout({ planId, optionId }: { planId: string; optionId: string | null }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["manual-checkout", planId, optionId], queryFn: () => getManualCheckout({ data: { planId, optionId } }) });
  const [countryId, setCountryId] = useState<string | null>(null);
  const [methodId, setMethodId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [txn, setTxn] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const methods = useMemo(() => {
    if (!q.data || !countryId) return [];
    const ids = new Set(q.data.links.filter((l) => l.country_id === countryId).map((l) => l.method_id));
    return q.data.methods.filter((m) => ids.has(m.id));
  }, [q.data, countryId]);
  const method = methods.find((m) => m.id === methodId) ?? null;
  const country = q.data?.countries.find((c) => c.id === countryId) ?? null;

  const quote = useQuery({
    queryKey: ["manual-quote", planId, optionId, methodId],
    enabled: !!methodId,
    queryFn: () => getManualQuote({ data: { planId, optionId, methodId: methodId! } }),
    refetchInterval: 5 * 60_000,
  });

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const u = URL.createObjectURL(file); setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Please attach the payment screenshot");
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error("Could not read image")); r.readAsDataURL(file);
      });
      return submitManualPayment({ data: { planId, optionId, methodId: methodId!, countryId: countryId!, transactionId: txn, screenshot: { type: file.type, base64 } } });
    },
    onSuccess: () => { setDone(true); setConfirmOpen(false); toast.success("Payment submitted for review"); void qc.invalidateQueries({ queryKey: ["my-manual-payments"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (q.error) return <div className="glass-card rounded-2xl p-5 text-sm text-destructive">{(q.error as Error).message}</div>;
  const pkg = q.data!.pkg;

  if (done) return (
    <div className="glass-card rounded-2xl p-6 text-center space-y-2">
      <Clock className="w-10 h-10 mx-auto text-warning" />
      <h2 className="text-lg font-semibold">Payment submitted</h2>
      <p className="text-sm text-muted-foreground">We are verifying your payment for {pkg.label}. Your package activates as soon as it is approved.</p>
    </div>
  );

  return (
    <section className="space-y-6">
      <div className="glass-card rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Selected package</p>
          <p className="text-lg font-semibold">{pkg.label}</p>
          <p className="text-xs text-muted-foreground">{pkg.days} days</p>
        </div>
        <p className="text-2xl font-bold">{fmt(pkg.price, "USD")} <span className="text-sm font-normal text-muted-foreground">USD</span></p>
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold">1. Select your country</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {q.data!.countries.map((c) => (
            <button key={c.id} onClick={() => { setCountryId(c.id); setMethodId(null); }}
              className={cn("rounded-xl border p-3 text-left text-sm transition-all", countryId === c.id ? "border-primary bg-primary/10 ring-2 ring-primary/40" : "border-white/10 hover:bg-white/5")}>
              <span className="text-xl mr-1">{c.logo_url ? <img src={c.logo_url} alt="" className="inline w-5 h-5 rounded-sm" /> : c.flag}</span>
              <span className="font-medium">{c.name}</span>
              <span className="block text-[11px] text-muted-foreground">{c.currency_code}</span>
            </button>
          ))}
        </div>
      </div>

      {countryId && (
        <div className="space-y-3">
          <h2 className="font-semibold">2. Choose a payment method</h2>
          {methods.length === 0 ? <p className="text-sm text-muted-foreground">No payment methods are available for this country yet. Please pick another country or use crypto checkout.</p> : (
            <div className="grid gap-3 sm:grid-cols-2">
              {methods.map((m) => (
                <button key={m.id} onClick={() => setMethodId(m.id)}
                  className={cn("rounded-2xl border p-4 text-left flex items-center gap-3", methodId === m.id ? "border-primary bg-primary/10 ring-2 ring-primary/40" : "border-white/10 hover:bg-white/5")}>
                  {m.logo_url ? <img src={m.logo_url} alt="" className="w-10 h-10 rounded-lg object-contain bg-white/5" /> : <div className="w-10 h-10 rounded-lg bg-primary/20 grid place-content-center font-bold">{String(m.name).slice(0, 2)}</div>}
                  <div><p className="font-semibold">{m.name}</p><p className="text-[11px] text-muted-foreground">{country?.flag} {country?.name} · {m.currency_code}</p></div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {method && (
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h2 className="font-semibold">3. Send your payment</h2>
          <div className="rounded-xl bg-white/[0.03] ring-1 ring-white/10 p-4">
            {quote.isLoading ? <Skeleton className="h-12" /> : quote.error ? <p className="text-sm text-destructive">{(quote.error as Error).message}</p> : quote.data && (
              <>
                <p className="text-xs text-muted-foreground">{fmt(pkg.price, "USD")} USD{quote.data.currency !== "USD" ? ` × ${quote.data.rate} ${quote.data.currency}/USD` : ""}</p>
                <p className="text-2xl font-bold">Payable: {fmt(quote.data.localAmount, quote.data.currency)}</p>
                <p className="text-[11px] text-muted-foreground">Live rate from {quote.data.source} · the exact amount is locked when you submit.</p>
              </>
            )}
          </div>
          <div className="space-y-2">
            {DETAIL_FIELDS.filter(([k]) => method[k]).map(([k, label]) => (
              <div key={k} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2">
                <div className="min-w-0"><p className="text-[11px] text-muted-foreground">{label}</p><p className="font-mono text-sm break-all">{String(method[k])}</p></div>
                <CopyValue value={String(method[k])} />
              </div>
            ))}
          </div>
          {method.instructions && <p className="text-sm text-muted-foreground whitespace-pre-line">{method.instructions}</p>}
          <Button className="w-full" disabled={!quote.data} onClick={() => setConfirmOpen(true)}><ShieldCheck className="w-4 h-4" />I Have Made Payment</Button>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Payment Confirmation</DialogTitle></DialogHeader>
          {method && quote.data && (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-2 text-sm rounded-xl bg-white/[0.03] ring-1 ring-white/10 p-3">
                <dt className="text-muted-foreground">Package</dt><dd>{pkg.label}</dd>
                <dt className="text-muted-foreground">Base price</dt><dd>{fmt(pkg.price, "USD")} USD</dd>
                <dt className="text-muted-foreground">Method</dt><dd>{method.name}</dd>
                <dt className="text-muted-foreground">Currency</dt><dd>{quote.data.currency}</dd>
                <dt className="text-muted-foreground">Amount</dt><dd className="font-semibold">{fmt(quote.data.localAmount, quote.data.currency)}</dd>
              </dl>
              <div className="space-y-1.5"><Label>Transaction ID *</Label><Input value={txn} onChange={(e) => setTxn(e.target.value)} placeholder="e.g. TRX123456789" /></div>
              <div className="space-y-1.5">
                <Label>Payment screenshot *</Label>
                <label className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 p-4 cursor-pointer hover:bg-white/5 text-sm">
                  <Upload className="w-4 h-4" />{file ? file.name : "Choose JPG, PNG or WebP"}
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0] ?? null; if (f && f.size > 5 * 1024 * 1024) { toast.error("Image must be under 5 MB"); return; } setFile(f); }} />
                </label>
                {preview && <img src={preview} alt="Payment screenshot preview" className="max-h-56 mx-auto rounded-lg" />}
              </div>
              <Button className="w-full" disabled={submit.isPending || txn.trim().length < 3 || !file} onClick={() => submit.mutate()}>
                {submit.isPending && <Loader2 className="animate-spin" />}Submit Payment
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function History() {
  const q = useQuery({ queryKey: ["my-manual-payments"], queryFn: () => listMyManualPayments() });
  return (
    <section className="glass-card rounded-2xl p-5 space-y-3">
      <h2 className="font-semibold">Manual payment history</h2>
      {q.isLoading ? <Skeleton className="h-24" /> : q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : (q.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No manual payments yet.</p>
      ) : (
        <div className="space-y-2">
          {q.data!.map((p) => (
            <div key={p.id} className="rounded-xl border border-white/10 p-3 text-sm space-y-1">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">{p.package_label}</span>
                <span className={cn("text-[11px] px-2 py-0.5 rounded-full ring-1 capitalize",
                  p.status === "approved" ? "bg-success/15 text-success ring-success/30" : p.status === "rejected" ? "bg-destructive/15 text-destructive ring-destructive/30" : "bg-warning/15 text-warning ring-warning/30")}>
                  {p.status === "approved" ? "Payment Successful ✓" : p.status}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{p.method_name} · {fmt(Number(p.local_amount), p.currency_code)} · Txn {p.transaction_id} · {new Date(p.created_at).toLocaleString()}</p>
              {p.status === "rejected" && (
                <p className="text-xs text-destructive flex gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0" />{p.rejection_reason || "Payment could not be verified. Please check your details and submit a valid payment."}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
