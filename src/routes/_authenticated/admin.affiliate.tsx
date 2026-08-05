import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { HandCoins, Loader2, Save, UserPlus, CalendarClock, RefreshCw, Crown } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  adminAddReferral, adminAdjustSubscriptionDays, adminAffiliateOverview, adminProcessWithdrawal,
  adminRegenerateReferralCode, adminSetAffiliateConfig, adminSetReferralStatus,
} from "@/lib/affiliate.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/affiliate")({
  head: () => ({
    meta: [
      { title: "Affiliate Control — AD4YOU Admin" },
      { name: "description", content: "Manage referral codes, commissions, subscription days and affiliate payouts." },
      { property: "og:title", content: "Affiliate Control — AD4YOU Admin" },
      { property: "og:description", content: "Admin tools for referrals, commissions and payout releases." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminAffiliatePage,
});

function AdminAffiliatePage() {
  const overviewQ = useQuery({
    queryKey: ["admin-affiliate"],
    queryFn: () => adminAffiliateOverview(),
    refetchInterval: 20000,
  });
  const data = overviewQ.data;

  const [minWithdrawal, setMinWithdrawal] = useState("");
  const [commission, setCommission] = useState("");
  const [lock, setLock] = useState<boolean | null>(null);

  const effectiveMin = minWithdrawal !== "" ? minWithdrawal : String(data?.config.minWithdrawal ?? 100);
  const effectiveCommission = commission !== "" ? commission : String(data?.config.commissionPercent ?? 30);
  const effectiveLock = lock ?? data?.config.lockPayoutMethods ?? true;

  const saveConfig = useMutation({
    mutationFn: () =>
      adminSetAffiliateConfig({
        data: {
          minWithdrawal: Number(effectiveMin),
          commissionPercent: Number(effectiveCommission),
          lockPayoutMethods: effectiveLock,
        },
      }),
    onSuccess: () => { toast.success("Affiliate settings saved"); overviewQ.refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [referrerId, setReferrerId] = useState("");
  const [referredId, setReferredId] = useState("");
  const [markPremium, setMarkPremium] = useState(false);
  const [manualCommission, setManualCommission] = useState("");

  const addReferral = useMutation({
    mutationFn: () =>
      adminAddReferral({
        data: {
          referrerId,
          referredId,
          markPremium,
          commission: manualCommission ? Number(manualCommission) : undefined,
        },
      }),
    onSuccess: () => { toast.success("Referral saved"); setReferredId(""); setManualCommission(""); overviewQ.refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: "free" | "premium"; commission?: number }) => adminSetReferralStatus({ data: v }),
    onSuccess: () => { toast.success("Referral updated"); overviewQ.refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const process = useMutation({
    mutationFn: (v: { id: string; action: "release" | "reject" }) => adminProcessWithdrawal({ data: v }),
    onSuccess: () => { toast.success("Payout updated"); overviewQ.refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const regenerate = useMutation({
    mutationFn: (userId: string) => adminRegenerateReferralCode({ data: { userId } }),
    onSuccess: (r) => { toast.success(`New code: ${r.code}`); overviewQ.refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [daysUserId, setDaysUserId] = useState("");
  const [days, setDays] = useState("30");
  const adjustDays = useMutation({
    mutationFn: () => adminAdjustSubscriptionDays({ data: { userId: daysUserId, days: Number(days) } }),
    onSuccess: (r) => { toast.success(`Subscription now ends ${new Date(r.end_date).toLocaleDateString()}`); overviewQ.refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const users = data?.users ?? [];
  const pending = useMemo(() => (data?.withdrawals ?? []).filter((w) => w.status === "pending"), [data]);
  const processed = useMemo(() => (data?.withdrawals ?? []).filter((w) => w.status !== "pending"), [data]);

  const userPicker = (value: string, onChange: (v: string) => void, placeholder: string) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="bg-white/5 border-white/10"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent className="max-h-72">
        {users.map((u) => (
          <SelectItem key={u.id} value={u.id}>{u.full_name || u.email} · {u.email}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <AdminShell title="Affiliate Control" description="Referrals, commissions, subscription days and payouts">
      {overviewQ.isLoading ? (
        <div className="py-16 grid place-content-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-6">
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><Save className="w-4 h-4" />Program settings</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Minimum withdrawal ($)</Label>
                <Input value={effectiveMin} onChange={(e) => setMinWithdrawal(e.target.value)} inputMode="decimal" className="bg-white/5 border-white/10" />
              </div>
              <div className="space-y-2">
                <Label>Commission (%)</Label>
                <Input value={effectiveCommission} onChange={(e) => setCommission(e.target.value)} inputMode="decimal" className="bg-white/5 border-white/10" />
              </div>
              <div className="space-y-2">
                <Label>Lock payout methods until minimum</Label>
                <div className="flex items-center gap-3 h-10">
                  <Switch checked={effectiveLock} onCheckedChange={setLock} />
                  <span className="text-sm text-muted-foreground">{effectiveLock ? "Locked until threshold" : "Always unlocked"}</span>
                </div>
              </div>
            </div>
            <Button onClick={() => saveConfig.mutate()} disabled={saveConfig.isPending} className="mt-4 bg-gradient-to-r from-primary to-accent text-white">
              {saveConfig.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save settings"}
            </Button>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2"><UserPlus className="w-4 h-4" />Add / update a referral</h3>
              <div className="space-y-3">
                {userPicker(referrerId, setReferrerId, "Referrer (earns commission)")}
                {userPicker(referredId, setReferredId, "Referred user")}
                <div className="flex items-center gap-3">
                  <Switch checked={markPremium} onCheckedChange={setMarkPremium} />
                  <span className="text-sm">Count as premium referral</span>
                </div>
                {markPremium && (
                  <Input placeholder="Commission amount ($)" inputMode="decimal" value={manualCommission}
                    onChange={(e) => setManualCommission(e.target.value)} className="bg-white/5 border-white/10" />
                )}
                <Button onClick={() => addReferral.mutate()} disabled={!referrerId || !referredId || addReferral.isPending} className="w-full bg-white/10 hover:bg-white/15">
                  {addReferral.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save referral"}
                </Button>
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2"><CalendarClock className="w-4 h-4" />Adjust subscription days</h3>
              <div className="space-y-3">
                {userPicker(daysUserId, setDaysUserId, "Select user")}
                <Input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric"
                  placeholder="Days to add (negative to remove)" className="bg-white/5 border-white/10" />
                <Button onClick={() => adjustDays.mutate()} disabled={!daysUserId || adjustDays.isPending} className="w-full bg-white/10 hover:bg-white/15">
                  {adjustDays.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
                </Button>
                <p className="text-xs text-muted-foreground">Extends the user's latest subscription end date and reactivates it when the new date is in the future.</p>
              </div>
            </section>
          </div>

          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><HandCoins className="w-4 h-4" />Pending payout requests</h3>
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No pending requests.</p>
            ) : (
              <div className="space-y-2">
                {pending.map((w) => (
                  <div key={w.id as string} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/20 bg-amber-500/5 p-3">
                    <div>
                      <p className="font-semibold">${Number(w.amount).toFixed(2)} · {String(w.method)}</p>
                      <p className="text-xs text-muted-foreground">{String(w.user_name ?? w.user_email)} · {String(w.user_email)}</p>
                      <p className="text-xs text-muted-foreground font-mono break-all">{JSON.stringify(w.method_details)}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => process.mutate({ id: w.id as string, action: "release" })}
                        className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white">Successfully sent</Button>
                      <Button size="sm" variant="ghost" onClick={() => process.mutate({ id: w.id as string, action: "reject" })}
                        className="text-destructive">Reject</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {processed.length > 0 && (
              <div className="mt-5 space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">History</p>
                {processed.map((w) => (
                  <div key={w.id as string} className="flex flex-wrap items-center justify-between gap-2 text-sm border border-white/5 rounded-lg px-3 py-2">
                    <span>${Number(w.amount).toFixed(2)} · {String(w.user_email)}</span>
                    <span className={cn("text-xs px-2 py-1 rounded-full capitalize",
                      w.status === "completed" ? "bg-emerald-500/20 text-emerald-300" : "bg-destructive/20 text-destructive")}>
                      {w.status === "completed" ? "success" : String(w.status)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><Crown className="w-4 h-4" />All referrals</h3>
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {(data?.referrals ?? []).map((r) => (
                <div key={r.id as string} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate">{String(r.referrer_email)} → {String(r.referred_email_resolved ?? "unknown")}</p>
                    <p className="text-xs text-muted-foreground">
                      {String(r.status).toUpperCase()} · ${Number(r.commission_amount).toFixed(2)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {r.status === "premium" ? (
                      <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: r.id as string, status: "free" })}>Set free</Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: r.id as string, status: "premium", commission: Number(effectiveMin) > 0 ? undefined : undefined })}>Set premium</Button>
                    )}
                  </div>
                </div>
              ))}
              {(data?.referrals.length ?? 0) === 0 && <p className="text-sm text-muted-foreground py-4">No referrals recorded yet.</p>}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><RefreshCw className="w-4 h-4" />Referral codes</h3>
            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {users.map((u) => (
                <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate">{u.full_name || u.email}</p>
                    <p className="text-xs font-mono text-primary">{u.referral_code ?? "—"}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => regenerate.mutate(u.id)}>Regenerate</Button>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </AdminShell>
  );
}
