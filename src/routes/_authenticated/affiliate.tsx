import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Copy, Share2, DollarSign, Users, Crown, Loader2, Send, Wallet, CheckCircle2, TrendingUp, Lock, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  getAffiliateOverview, removePayoutMethod, requestWithdrawal, savePayoutMethod,
} from "@/lib/affiliate.functions";
import { cn } from "@/lib/utils";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { FloatingNotifications } from "@/components/notifications/FloatingNotifications";

export const Route = createFileRoute("/_authenticated/affiliate")({
  head: () => ({
    meta: [
      { title: "Affiliate Program — Earn 30% Commission | AD4YOU" },
      { name: "description", content: "Invite publishers to AD4YOU and earn an instant 30% commission on every premium subscription. Track referrals and withdraw in real time." },
      { property: "og:title", content: "AD4YOU Affiliate Program — 30% Commission" },
      { property: "og:description", content: "Share your referral code, track premium conversions live and cash out once you reach the payout threshold." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AffiliatePage,
});

const METHODS = [
  { value: "wire_bank", label: "Wire Bank Transfer" },
  { value: "paypal", label: "PayPal" },
  { value: "payoneer", label: "Payoneer" },
  { value: "crypto", label: "Crypto (USDT/BTC)" },
] as const;

const FIELDS: Record<string, { key: string; label: string; placeholder?: string }[]> = {
  wire_bank: [
    { key: "bank_name", label: "Bank Name" },
    { key: "account_holder", label: "Account Holder" },
    { key: "account_number", label: "Account / IBAN" },
    { key: "swift", label: "SWIFT / BIC" },
  ],
  paypal: [{ key: "email", label: "PayPal Email", placeholder: "you@paypal.com" }],
  payoneer: [{ key: "email", label: "Payoneer Email" }, { key: "customer_id", label: "Customer ID (optional)" }],
  crypto: [{ key: "network", label: "Network (TRC20, BEP20, ERC20)" }, { key: "wallet_address", label: "Wallet Address" }],
};

function AffiliatePage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const overviewQ = useQuery({
    queryKey: ["affiliate-overview", user?.id],
    enabled: !!user,
    queryFn: () => getAffiliateOverview(),
    refetchInterval: 20000,
  });

  // Realtime sync: premium upgrades, payouts and referrals reflect instantly.
  useEffect(() => {
    if (!user) return;
    const invalidate = () => qc.invalidateQueries({ queryKey: ["affiliate-overview"] });
    const channel = supabase
      .channel("affiliate-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "affiliate_referrals" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "affiliate_withdrawals" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions" }, invalidate)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, qc]);

  const data = overviewQ.data;
  const totals = data?.totals;
  const config = data?.config ?? { minWithdrawal: 100, commissionPercent: 30, lockPayoutMethods: true };
  const referralCode = data?.referralCode ?? "";
  const referralLink = useMemo(
    () => (typeof window !== "undefined" && referralCode ? `${window.location.origin}/register?ref=${referralCode}` : ""),
    [referralCode],
  );

  const copyLink = async () => {
    if (!referralLink) return;
    try { await navigator.clipboard.writeText(referralLink); toast.success("Referral link copied!"); }
    catch { toast.error("Could not copy"); }
  };
  const share = async () => {
    if (!referralLink) return;
    if (navigator.share) {
      try { await navigator.share({ title: "Join AD4YOU", text: "Boost your ad revenue with AD4YOU:", url: referralLink }); } catch { /* dismissed */ }
    } else copyLink();
  };

  const [pmType, setPmType] = useState<string>("paypal");
  const [pmFields, setPmFields] = useState<Record<string, string>>({});

  const savePM = useMutation({
    mutationFn: async () => {
      const details: Record<string, string> = {};
      for (const [k, v] of Object.entries(pmFields)) if (v.trim()) details[k] = v.trim();
      if (Object.keys(details).length === 0) throw new Error("Fill in your payout details first");
      await savePayoutMethod({ data: { methodType: pmType as "paypal", details } });
    },
    onSuccess: () => { toast.success("Payout method saved"); setPmFields({}); overviewQ.refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deletePM = useMutation({
    mutationFn: (id: string) => removePayoutMethod({ data: { id } }).then(() => undefined),
    onSuccess: () => { toast.success("Removed"); overviewQ.refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [wMethodId, setWMethodId] = useState<string>("");
  const [wAmount, setWAmount] = useState<string>("");

  const withdraw = useMutation({
    mutationFn: async () => {
      const amount = Number(wAmount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount");
      if (!wMethodId) throw new Error("Choose a saved payout method");
      await requestWithdrawal({ data: { amount, methodId: wMethodId } });
    },
    onSuccess: () => { toast.success("Withdrawal request sent to admin"); setWAmount(""); overviewQ.refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const payoutLocked = config.lockPayoutMethods && !(totals?.canWithdraw ?? false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="pt-28 pb-20 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-accent grid place-content-center">
              <Crown className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight">Affiliate Program</h1>
              <p className="text-sm text-muted-foreground">
                Earn an instant <span className="text-primary font-semibold">{config.commissionPercent}% commission</span> the moment a referred user goes Premium.
              </p>
            </div>
          </div>

          {data?.setupRequired && (
            <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-100">
                Affiliate tables are not installed on the database yet. Run <code className="font-mono">AD4YOU_FINAL_SETUP.sql</code> once
                in your project's SQL editor — referrals, payouts and commissions activate immediately after.
              </p>
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-primary/10 via-accent/5 to-transparent p-6 mb-6">
            <p className="text-xs text-muted-foreground mb-2">YOUR REFERRAL LINK</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input value={referralLink || "Generating your unique link…"} readOnly className="bg-black/30 border-white/10 font-mono text-xs sm:text-sm" />
              <Button onClick={copyLink} disabled={!referralLink} className="bg-white/10 hover:bg-white/15"><Copy className="w-4 h-4 mr-2" />Copy</Button>
              <Button onClick={share} disabled={!referralLink} className="bg-gradient-to-r from-primary to-accent"><Share2 className="w-4 h-4 mr-2" />Share</Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Your unique code: <span className="font-mono text-primary text-sm">{referralCode || "—"}</span>
              <span className="ml-2 opacity-70">(share the code or the link — signup referral is optional for your invitee)</span>
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            {[
              { label: "Free invitees", value: totals?.freeCount ?? 0, icon: Users, color: "from-cyan-500/20 to-transparent" },
              { label: "Premium (paying)", value: totals?.premiumCount ?? 0, icon: Crown, color: "from-amber-500/20 to-transparent" },
              { label: "Total earned", value: `$${(totals?.earned ?? 0).toFixed(2)}`, icon: TrendingUp, color: "from-emerald-500/20 to-transparent" },
              { label: "Available now", value: `$${(totals?.available ?? 0).toFixed(2)}`, icon: DollarSign, color: "from-violet-500/20 to-transparent" },
            ].map((s) => (
              <div key={s.label} className={cn("rounded-2xl border border-white/10 p-5 bg-gradient-to-br", s.color)}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                  <s.icon className="w-4 h-4 text-white/60" />
                </div>
                <p className="text-2xl font-bold">{s.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-6 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="font-semibold flex items-center gap-2"><Wallet className="w-4 h-4 text-emerald-300" />Withdrawal Progress</h3>
                <p className="text-xs text-muted-foreground">Reach ${config.minWithdrawal} available balance to cash out</p>
              </div>
              <p className="text-lg font-bold text-emerald-300">${(totals?.available ?? 0).toFixed(2)} / ${config.minWithdrawal}</p>
            </div>
            <Progress value={totals?.progressPct ?? 0} className="h-3 bg-white/5" />
            <p className="text-xs text-muted-foreground mt-2">
              {(totals?.canWithdraw ?? false)
                ? "🎉 Threshold reached — you can withdraw now!"
                : `$${Math.max(0, config.minWithdrawal - (totals?.available ?? 0)).toFixed(2)} to go`}
            </p>
            {(totals?.pending ?? 0) > 0 && (
              <p className="text-xs text-amber-300 mt-1">${(totals?.pending ?? 0).toFixed(2)} pending admin release</p>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2"><Users className="w-4 h-4" />Your Invites (live)</h3>
              {(data?.referrals.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No invites yet. Share your link to start earning.</p>
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-2">
                  {data!.referrals.map((r) => {
                    const isPremium = r.status === "premium";
                    return (
                      <div key={r.id} className={cn("flex items-center justify-between rounded-xl border p-3",
                        isPremium ? "border-amber-400/30 bg-amber-500/5" : "border-white/10 bg-white/[0.02]")}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn("w-9 h-9 rounded-full grid place-content-center text-sm font-bold shrink-0",
                            isPremium ? "bg-gradient-to-br from-amber-400 to-yellow-600 text-black" : "bg-white/10")}>
                            {r.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{r.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          {isPremium ? (
                            <>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold">PREMIUM</span>
                              <p className="text-sm font-bold text-emerald-300 mt-1">+${r.commission_amount.toFixed(2)}</p>
                            </>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-muted-foreground">FREE</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <h3 className="font-semibold mb-1 flex items-center gap-2"><Wallet className="w-4 h-4" />Payout Methods</h3>
              <p className="text-xs text-muted-foreground mb-4">
                {payoutLocked
                  ? `Locked until you reach $${config.minWithdrawal} available balance.`
                  : "Add where you want to receive your commissions."}
              </p>

              <div className="space-y-2 mb-5">
                {(data?.payoutMethods ?? []).map((pm) => (
                  <div key={pm.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{METHODS.find((m) => m.value === pm.method_type)?.label ?? pm.method_type}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[220px]">
                          {pm.details.email || pm.details.wallet_address || pm.details.account_number || "Saved"}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => deletePM.mutate(pm.id)} className="text-xs text-destructive hover:underline">Remove</button>
                  </div>
                ))}
              </div>

              {payoutLocked ? (
                <div className="rounded-xl border border-white/10 bg-black/20 p-5 text-center">
                  <Lock className="w-5 h-5 mx-auto text-muted-foreground" />
                  <p className="text-sm mt-2">Payout methods unlock at ${config.minWithdrawal}</p>
                  <p className="text-xs text-muted-foreground mt-1">Keep referring — {config.commissionPercent}% of every first premium payment is yours.</p>
                </div>
              ) : (
                <div className="space-y-3 border-t border-white/5 pt-4">
                  <Select value={pmType} onValueChange={(v) => { setPmType(v); setPmFields({}); }}>
                    <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                    <SelectContent>{METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                  </Select>
                  {(FIELDS[pmType] ?? []).map((f) => (
                    <Input key={f.key} placeholder={f.placeholder ?? f.label}
                      value={pmFields[f.key] ?? ""}
                      onChange={(e) => setPmFields((s) => ({ ...s, [f.key]: e.target.value }))}
                      className="bg-white/5 border-white/10" />
                  ))}
                  <Button onClick={() => savePM.mutate()} disabled={savePM.isPending} className="w-full bg-white/10 hover:bg-white/15">
                    {savePM.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save method"}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {(totals?.canWithdraw ?? false) && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2"><Send className="w-4 h-4" />Request Withdrawal</h3>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <Select value={wMethodId} onValueChange={setWMethodId}>
                  <SelectTrigger className="bg-white/5 border-white/10"><SelectValue placeholder="Payout method" /></SelectTrigger>
                  <SelectContent>
                    {(data?.payoutMethods ?? []).map((pm) => (
                      <SelectItem key={pm.id} value={pm.id}>
                        {METHODS.find((m) => m.value === pm.method_type)?.label ?? pm.method_type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input inputMode="decimal" placeholder={`Min $${config.minWithdrawal}`} value={wAmount}
                  onChange={(e) => setWAmount(e.target.value)} className="bg-white/5 border-white/10" />
                <Button onClick={() => withdraw.mutate()} disabled={withdraw.isPending}
                  className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white">
                  {withdraw.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Request payout"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Available ${(totals?.available ?? 0).toFixed(2)}. After admin marks it as sent, your balance resets and the request moves to history.
              </p>
            </div>
          )}

          {(data?.withdrawals.length ?? 0) > 0 && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />Payout History</h3>
              <div className="space-y-2">
                {data!.withdrawals.map((w) => (
                  <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 text-sm border border-white/5 rounded-lg px-3 py-3">
                    <div>
                      <p className="font-medium">${w.amount.toFixed(2)} · {METHODS.find((m) => m.value === w.method)?.label ?? w.method}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(w.created_at).toLocaleString()}
                        {w.processed_at ? ` · processed ${new Date(w.processed_at).toLocaleDateString()}` : ""}
                      </p>
                      {w.admin_notes && <p className="text-xs text-muted-foreground mt-0.5">{w.admin_notes}</p>}
                    </div>
                    <span className={cn("text-xs px-2 py-1 rounded-full capitalize",
                      w.status === "completed" ? "bg-emerald-500/20 text-emerald-300"
                        : w.status === "pending" ? "bg-amber-500/20 text-amber-300"
                          : "bg-destructive/20 text-destructive")}>
                      {w.status === "completed" ? "success" : w.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
      <FloatingNotifications />
      <Footer />
    </div>
  );
}
