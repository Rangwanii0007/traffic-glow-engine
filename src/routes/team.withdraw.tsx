import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/team/Shell";
import { useMember } from "@/hooks/use-member";
import { memberRequestWithdrawal, memberWithdrawMeta } from "@/lib/member.functions";
import { STATUS_STYLES, money } from "@/lib/money";

export const Route = createFileRoute("/team/withdraw")({
  head: () => ({
    meta: [
      { title: "Withdraw Earnings — AD4YOU Team" },
      { name: "description", content: "Request a payout of your AD4YOU team earnings using the payment methods your admin offers." },
      { property: "og:title", content: "Withdraw Earnings — AD4YOU Team" },
      { property: "og:description", content: "Request a payout of your available team balance in a few taps." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WithdrawPage,
});

type Field = { key: string; label: string; type?: string; required?: boolean; placeholder?: string };

function WithdrawPage() {
  const { token } = useMember();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["member", "withdraw-meta"],
    queryFn: () => memberWithdrawMeta({ data: { token: token! } }),
    enabled: !!token,
  });

  const [methodId, setMethodId] = useState("");
  const [amount, setAmount] = useState("");
  const [details, setDetails] = useState<Record<string, string>>({});

  const methods = query.data?.methods ?? [];
  const method = methods.find((m) => String(m['id']) === methodId);
  const fields = useMemo<Field[]>(() => {
    const raw = method?.['fields'];
    return Array.isArray(raw) ? (raw as unknown as Field[]) : [];
  }, [method]);

  const s = query.data?.rates.currency_symbol ?? "$";
  const balance = query.data?.balance ?? 0;
  const methodMin = Number(method?.['min_amount'] ?? 0);
  const min = Math.max(query.data?.rates.min_withdrawal ?? 0, methodMin);
  const open = query.data?.openRequest ?? null;

  const request = useMutation({
    mutationFn: () =>
      memberRequestWithdrawal({ data: { token: token!, amount: Number(amount), methodId, details } }),
    onSuccess: () => {
      toast.success("Withdrawal requested — your team owner will review it");
      setAmount(""); setDetails({});
      void qc.invalidateQueries({ queryKey: ["member"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const submit = () => {
    if (!methodId) return toast.error("Choose a payment method");
    const value = Number(amount);
    if (!value || value <= 0) return toast.error("Enter the amount you want to withdraw");
    if (value < min) return toast.error(`Minimum withdrawal is ${money(min, s)}`);
    if (value > balance) return toast.error("Amount is higher than your available balance");
    for (const f of fields) {
      if (f.required !== false && !details[f.key]?.trim()) return toast.error(`Please fill in ${f.label}`);
    }
    request.mutate();
  };

  if (query.isLoading) return <Skeleton className="h-72 rounded-2xl" />;
  if (query.error) return <p className="text-sm text-red-300">{(query.error as Error).message}</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Withdraw</h1>
        <p className="text-sm text-muted-foreground">Request a payout from your available balance.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Available balance" value={money(balance, s)} />
        <StatCard label="Minimum withdrawal" value={money(min, s)} />
        <StatCard label="Currency" value={query.data?.rates.currency_code ?? "USD"} />
      </div>

      {open ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 sm:p-6 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold">You already have a request in progress</p>
            <span className={`text-[11px] px-2 py-1 rounded-full ring-1 ${STATUS_STYLES[String(open['status'])] ?? ""}`}>{String(open['status'])}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {money(open['amount'], s)} via {String(open['method_name'] ?? open['method_slug'] ?? "your chosen method")} — requested{" "}
            {open['requested_at'] ? new Date(String(open['requested_at'])).toLocaleString() : ""}. You can send a new request once this one is finished.
          </p>
        </div>
      ) : (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6 space-y-5 max-w-2xl">
          <div className="flex items-center gap-2"><Wallet className="w-4 h-4 text-primary" /><h2 className="font-semibold">New request</h2></div>

          {methods.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payment methods are available yet. Please check back shortly.</p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Payment method</Label>
                <Select value={methodId} onValueChange={(v) => { setMethodId(v); setDetails({}); }}>
                  <SelectTrigger><SelectValue placeholder="Choose how you want to be paid" /></SelectTrigger>
                  <SelectContent>
                    {methods.map((m) => (
                      <SelectItem key={String(m['id'])} value={String(m['id'])}>{String(m['name'])}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {method?.['instructions'] ? (
                <p className="text-xs text-muted-foreground whitespace-pre-line rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  {String(method['instructions'])}
                </p>
              ) : null}

              {fields.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {fields.map((f) => (
                    <div key={f.key} className="space-y-1.5">
                      <Label className="text-xs">{f.label}{f.required === false ? " (optional)" : ""}</Label>
                      <Input
                        type={f.type === "number" ? "number" : f.type === "email" ? "email" : "text"}
                        placeholder={f.placeholder ?? ""}
                        value={details[f.key] ?? ""}
                        onChange={(e) => setDetails((d) => ({ ...d, [f.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="space-y-1.5 max-w-xs">
                <Label className="text-xs">Amount ({s})</Label>
                <Input type="number" step="0.01" min={min} max={balance} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(min || 10)} />
                <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => setAmount(String(balance))}>
                  Withdraw everything ({money(balance, s)})
                </button>
              </div>

              <Button onClick={submit} disabled={request.isPending}>
                {request.isPending ? <Loader2 className="animate-spin" /> : <Wallet className="w-4 h-4" />}Request withdrawal
              </Button>
              <p className="text-[11px] text-muted-foreground">
                The amount is held from your balance while the request is reviewed. If it is rejected, it goes straight back to your balance.
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
