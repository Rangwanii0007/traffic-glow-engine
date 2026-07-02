import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Share2, DollarSign, Users, Crown, Loader2, Send, Wallet, CheckCircle2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard/affiliate")({
  head: () => ({ meta: [{ title: "Affiliate Program — AD4YOU" }] }),
  component: AffiliatePage,
});

const COMMISSION_RATE = 0.30;
const WITHDRAW_MIN = 100;
const METHODS = [
  { value: "wire_bank", label: "Wire Bank Transfer" },
  { value: "paypal", label: "PayPal" },
  { value: "payoneer", label: "Payoneer" },
  { value: "crypto", label: "Crypto (USDT/BTC)" },
] as const;

type Referral = {
  id: string; referred_id: string; referred_email: string | null;
  status: "free" | "premium"; commission_amount: number; activated_at: string | null; created_at: string;
  users?: { full_name: string | null; email: string } | null;
};
type Withdrawal = { id: string; amount: number; method: string; status: string; created_at: string };

function AffiliatePage() {
  const { user, profile } = useAuth();
  const qc = useQueryClient();

  const referralCode = (profile as { referral_code?: string } | null)?.referral_code ?? "";
  const referralLink = typeof window !== "undefined" && referralCode
    ? `${window.location.origin}/register?ref=${referralCode}`
    : "";

  const { data: referrals = [] } = useQuery({
    queryKey: ["affiliate", "referrals", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("affiliate_referrals")
        .select("id, referred_id, referred_email, status, commission_amount, activated_at, created_at, users:referred_id(full_name, email)")
        .eq("referrer_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Referral[];
    },
  });

  const { data: withdrawals = [] } = useQuery({
    queryKey: ["affiliate", "withdrawals", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("affiliate_withdrawals")
        .select("id, amount, method, status, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Withdrawal[];
    },
  });

  const { data: paymentMethods = [] } = useQuery({
    queryKey: ["payment-methods", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("payment_methods").select("*").eq("user_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const totals = useMemo(() => {
    const freeCount = referrals.filter((r) => r.status === "free").length;
    const premiumCount = referrals.filter((r) => r.status === "premium").length;
    const earned = referrals.reduce((s, r) => s + Number(r.commission_amount || 0), 0);
    const withdrawn = withdrawals.filter((w) => w.status === "completed").reduce((s, w) => s + Number(w.amount), 0);
    const pending = withdrawals.filter((w) => w.status === "pending").reduce((s, w) => s + Number(w.amount), 0);
    const available = Math.max(0, earned - withdrawn - pending);
    return { freeCount, premiumCount, earned, withdrawn, pending, available };
  }, [referrals, withdrawals]);

  const progressPct = Math.min(100, (totals.available / WITHDRAW_MIN) * 100);
  const hasFirstPremium = totals.premiumCount > 0;

  const copyLink = async () => {
    if (!referralLink) return;
    try { await navigator.clipboard.writeText(referralLink); toast.success("Link copied!"); }
    catch { toast.error("Could not copy"); }
  };
  const share = async () => {
    if (!referralLink) return;
    if (navigator.share) {
      try { await navigator.share({ title: "Join AD4YOU", text: "Get premium ad revenue on AD4YOU:", url: referralLink }); } catch {}
    } else copyLink();
  };

  // Payment method form
  const [pmType, setPmType] = useState<string>("paypal");
  const [pmFields, setPmFields] = useState<Record<string, string>>({});

  const savePM = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const details: Record<string, string> = { ...pmFields };
      const { error } = await supabase.from("payment_methods").insert({
        user_id: user.id, method_type: pmType, details, is_default: paymentMethods.length === 0,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Payment method saved"); setPmFields({}); qc.invalidateQueries({ queryKey: ["payment-methods"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deletePM = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payment_methods").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["payment-methods"] }); },
  });

  // Withdrawal
  const [wMethod, setWMethod] = useState<string>("paypal");
  const [wAmount, setWAmount] = useState<string>("");

  const requestWithdraw = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const amount = Number(wAmount);
      if (!Number.isFinite(amount) || amount < WITHDRAW_MIN) throw new Error(`Minimum withdrawal is $${WITHDRAW_MIN}`);
      if (amount > totals.available) throw new Error("Amount exceeds available balance");
      const pm = paymentMethods.find((p) => p.method_type === wMethod);
      const { error } = await supabase.from("affiliate_withdrawals").insert({
        user_id: user.id, amount, method: wMethod, method_details: pm?.details ?? {},
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Withdrawal requested!"); setWAmount(""); qc.invalidateQueries({ queryKey: ["affiliate"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const pmFieldsByType: Record<string, { key: string; label: string; placeholder?: string }[]> = {
    wire_bank: [
      { key: "bank_name", label: "Bank Name" },
      { key: "account_holder", label: "Account Holder" },
      { key: "account_number", label: "Account / IBAN" },
      { key: "swift", label: "SWIFT / BIC" },
    ],
    paypal: [{ key: "email", label: "PayPal Email", placeholder: "you@paypal.com" }],
    payoneer: [{ key: "email", label: "Payoneer Email" }, { key: "customer_id", label: "Customer ID (optional)" }],
    crypto: [{ key: "network", label: "Network (e.g. TRC20, BEP20, ERC20)" }, { key: "wallet_address", label: "Wallet Address" }],
  };

  return (
    <DashboardShell>
      <div className="mb-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent grid place-content-center">
          <Crown className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Affiliate Program</h1>
          <p className="text-sm text-muted-foreground">Earn <span className="text-primary font-semibold">30% commission</span> for every Premium user you refer.</p>
        </div>
      </div>

      {/* Referral link */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-primary/10 via-accent/5 to-transparent p-6 mb-6">
        <p className="text-xs text-muted-foreground mb-2">YOUR REFERRAL LINK</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input value={referralLink} readOnly className="bg-black/30 border-white/10 font-mono text-xs sm:text-sm" />
          <Button onClick={copyLink} className="bg-white/10 hover:bg-white/15"><Copy className="w-4 h-4 mr-2" />Copy</Button>
          <Button onClick={share} className="bg-gradient-to-r from-primary to-accent"><Share2 className="w-4 h-4 mr-2" />Share</Button>
        </div>
        <p className="text-xs text-muted-foreground mt-3">Your unique code: <span className="font-mono text-primary">{referralCode || "—"}</span></p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {[
          { label: "Free invitees", value: totals.freeCount, icon: Users, color: "from-cyan-500/20 to-transparent" },
          { label: "Premium (paying)", value: totals.premiumCount, icon: Crown, color: "from-amber-500/20 to-transparent" },
          { label: "Total earned", value: `$${totals.earned.toFixed(2)}`, icon: TrendingUp, color: "from-emerald-500/20 to-transparent" },
          { label: "Available", value: `$${totals.available.toFixed(2)}`, icon: DollarSign, color: "from-violet-500/20 to-transparent" },
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

      {/* Withdrawal progress — only after first premium referral */}
      {hasFirstPremium && (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold flex items-center gap-2"><Wallet className="w-4 h-4 text-emerald-300" />Withdrawal Progress</h3>
              <p className="text-xs text-muted-foreground">Reach ${WITHDRAW_MIN} available balance to cash out</p>
            </div>
            <p className="text-lg font-bold text-emerald-300">${totals.available.toFixed(2)} / ${WITHDRAW_MIN}</p>
          </div>
          <Progress value={progressPct} className="h-3 bg-white/5" />
          <p className="text-xs text-muted-foreground mt-2">
            {progressPct >= 100 ? "🎉 You can withdraw now!" : `$${(WITHDRAW_MIN - totals.available).toFixed(2)} to go`}
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Referrals list */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Users className="w-4 h-4" />Your Invites (realtime)</h3>
          {referrals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No invites yet. Share your link to start earning.</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
              {referrals.map((r) => {
                const email = r.users?.email || r.referred_email || "user";
                const name = r.users?.full_name || email.split("@")[0];
                const isPremium = r.status === "premium";
                return (
                  <div key={r.id} className={cn(
                    "flex items-center justify-between rounded-xl border p-3 transition-colors",
                    isPremium ? "border-amber-400/30 bg-amber-500/5" : "border-white/10 bg-white/[0.02]",
                  )}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn("w-9 h-9 rounded-full grid place-content-center text-sm font-bold shrink-0",
                        isPremium ? "bg-gradient-to-br from-amber-400 to-yellow-600" : "bg-white/10")}>
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{name}</p>
                        <p className="text-xs text-muted-foreground truncate">{email}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {isPremium ? (
                        <>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold">PREMIUM</span>
                          <p className="text-sm font-bold text-emerald-300 mt-1">+${Number(r.commission_amount).toFixed(2)}</p>
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

        {/* Payment methods */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Wallet className="w-4 h-4" />Payment Methods</h3>

          <div className="space-y-2 mb-5">
            {paymentMethods.map((pm) => (
              <div key={pm.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <div>
                    <p className="text-sm font-medium capitalize">{METHODS.find((m) => m.value === pm.method_type)?.label ?? pm.method_type}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[220px]">
                      {(pm.details as Record<string, string>).email || (pm.details as Record<string, string>).wallet_address || (pm.details as Record<string, string>).account_number || "Saved"}
                    </p>
                  </div>
                </div>
                <button onClick={() => deletePM.mutate(pm.id)} className="text-xs text-destructive hover:underline">Remove</button>
              </div>
            ))}
          </div>

          <div className="space-y-3 border-t border-white/5 pt-4">
            <Select value={pmType} onValueChange={(v) => { setPmType(v); setPmFields({}); }}>
              <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
              <SelectContent>{METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>

            {(pmFieldsByType[pmType] || []).map((f) => (
              <Input key={f.key} placeholder={f.placeholder ?? f.label}
                value={pmFields[f.key] ?? ""}
                onChange={(e) => setPmFields((s) => ({ ...s, [f.key]: e.target.value }))}
                className="bg-white/5 border-white/10"
              />
            ))}
            <Button onClick={() => savePM.mutate()} disabled={savePM.isPending} className="w-full bg-white/10 hover:bg-white/15">
              {savePM.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save method"}
            </Button>
          </div>
        </div>
      </div>

      {/* Withdraw */}
      {hasFirstPremium && (
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Send className="w-4 h-4" />Request Withdrawal</h3>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <Select value={wMethod} onValueChange={setWMethod}>
              <SelectTrigger className="bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
              <SelectContent>{METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input type="number" placeholder={`Min $${WITHDRAW_MIN}`} value={wAmount} onChange={(e) => setWAmount(e.target.value)} className="bg-white/5 border-white/10" />
            <Button onClick={() => requestWithdraw.mutate()} disabled={requestWithdraw.isPending || totals.available < WITHDRAW_MIN}
              className="bg-gradient-to-r from-emerald-500 to-teal-500">
              {requestWithdraw.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Withdraw"}
            </Button>
          </div>
          {withdrawals.length > 0 && (
            <div className="mt-5 space-y-2">
              <p className="text-xs text-muted-foreground">RECENT WITHDRAWALS</p>
              {withdrawals.slice(0, 5).map((w) => (
                <div key={w.id} className="flex items-center justify-between text-sm border border-white/5 rounded-lg px-3 py-2">
                  <span>${Number(w.amount).toFixed(2)} • {METHODS.find((m) => m.value === w.method)?.label ?? w.method}</span>
                  <span className={cn("text-xs px-2 py-0.5 rounded-full",
                    w.status === "completed" ? "bg-emerald-500/20 text-emerald-300" :
                    w.status === "pending" ? "bg-amber-500/20 text-amber-300" : "bg-white/10")}>
                    {w.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
