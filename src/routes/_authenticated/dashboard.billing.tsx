import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CryptoCheckoutModal } from "@/components/pricing/CryptoCheckoutModal";
import { cn } from "@/lib/utils";

type SearchParams = { success?: boolean; cancelled?: boolean };

export const Route = createFileRoute("/_authenticated/dashboard/billing")({
  head: () => ({ meta: [{ title: "Billing — AD4YOU" }] }),
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    success: s.success === "true" || s.success === true,
    cancelled: s.cancelled === "true" || s.cancelled === true,
  }),
  component: BillingPage,
});

function BillingPage() {
  const { user } = useAuth();
  const uid = user?.id;
  const qc = useQueryClient();
  const search = useSearch({ from: "/_authenticated/dashboard/billing" });
  const navigate = useNavigate();

  const [selectedPlan, setSelectedPlan] = useState<null | { id: string; name: string; slug: string; price: number; duration_days: number }>(null);

  useEffect(() => {
    if (search.success) {
      toast.success("Payment successful! Your subscription is being activated.");
      qc.invalidateQueries({ queryKey: ["my-subscription"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      navigate({ to: "/dashboard/billing", search: {}, replace: true });
    } else if (search.cancelled) {
      toast.info("Payment cancelled");
      navigate({ to: "/dashboard/billing", search: {}, replace: true });
    }
  }, [search.success, search.cancelled, qc, navigate]);

  // Realtime: refresh subscription on change
  useEffect(() => {
    if (!uid) return;
    const channel = supabase
      .channel(`sub-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${uid}` }, () => {
        qc.invalidateQueries({ queryKey: ["my-subscription"] });
        toast.success("Subscription updated");
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [uid, qc]);

  const plansQ = useQuery({
    queryKey: ["plans-all"],
    queryFn: async () => {
      const { data } = await supabase.from("plans").select("*").eq("is_active", true).order("sort_order");
      return data ?? [];
    },
  });

  const subQ = useQuery({
    queryKey: ["my-subscription", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("id, status, start_date, end_date, duration_days, plan_id, plans(name, color, price, slug, duration_days)")
        .eq("user_id", uid!)
        .maybeSingle();
      return data;
    },
  });

  const paymentsQ = useQuery({
    queryKey: ["payments", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("id, created_at, amount, crypto_type, status, nowpayments_id, plans(name)")
        .eq("user_id", uid!)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  async function cancelSubscription() {
    if (!subQ.data?.id) return;
    if (!confirm("Cancel your subscription? You'll keep access until the current period ends.")) return;
    const { error } = await supabase.from("subscriptions").update({ status: "cancelled" }).eq("id", subQ.data.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Subscription cancelled");
      qc.invalidateQueries({ queryKey: ["my-subscription"] });
    }
  }

  const sub = subQ.data;
  const currentPlanId = sub?.plan_id;
  const otherPlans = plansQ.data?.filter((p) => p.id !== currentPlanId && !p.is_free) ?? [];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing & Plans</h1>
        <p className="text-muted-foreground mt-1">Manage your subscription and payment history.</p>
      </div>

      {/* Current subscription */}
      <div className="glass-card rounded-3xl p-6 sm:p-8">
        <h2 className="text-lg font-semibold mb-4">Current subscription</h2>
        {subQ.isLoading ? (
          <Skeleton className="h-24" />
        ) : sub ? (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="px-3 py-1 rounded-full text-xs font-bold uppercase text-white" style={{ background: sub.plans?.color ?? "#6b7280" }}>
                  {sub.plans?.name}
                </span>
                <span className="text-sm text-muted-foreground capitalize">{sub.status}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {sub.duration_days === 0 ? "Unlimited access" : `Expires ${new Date(sub.end_date).toLocaleDateString()}`}
              </p>
            </div>
            {sub.status === "active" && sub.plans?.slug !== "free" && (
              <Button variant="outline" onClick={cancelSubscription}>Cancel subscription</Button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No active subscription.</p>
        )}
      </div>

      {/* Upgrade / Renew */}
      <div>
        <h2 className="text-lg font-semibold mb-4">{sub?.plans?.slug === "free" ? "Upgrade your plan" : "Switch plan"}</h2>
        {plansQ.isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64" />)}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {otherPlans.map((p) => (
              <div
                key={p.id}
                className={cn(
                  "glass-card rounded-2xl p-6 relative overflow-hidden",
                  p.is_popular && "ring-2 ring-primary/40 shadow-[0_0_40px_rgba(139,92,246,0.2)]",
                )}
              >
                {p.is_popular && (
                  <span className="absolute top-4 right-4 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-gradient-to-r from-primary to-accent text-white">
                    Popular
                  </span>
                )}
                <h3 className="font-bold text-lg" style={{ color: p.color ?? undefined }}>{p.name}</h3>
                <p className="text-3xl font-bold mt-2">
                  ${Number(p.price).toFixed(2)}
                  <span className="text-sm text-muted-foreground font-normal">/{p.duration_days} days</span>
                </p>
                <p className="text-sm text-muted-foreground mt-2 mb-5">{p.description}</p>
                <Button
                  className="w-full bg-gradient-to-r from-primary to-accent text-white"
                  onClick={() =>
                    setSelectedPlan({
                      id: p.id,
                      name: p.name,
                      slug: p.slug,
                      price: Number(p.price),
                      duration_days: p.duration_days ?? 30,
                    })
                  }
                >
                  {sub?.plan_id === p.id ? "Renew" : "Upgrade"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payment history */}
      <div className="glass-card rounded-3xl p-6">
        <h2 className="text-lg font-semibold mb-4">Payment history</h2>
        {paymentsQ.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : paymentsQ.data?.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No payments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-2 font-medium">Date</th>
                  <th className="text-left p-2 font-medium">Plan</th>
                  <th className="text-left p-2 font-medium">Amount</th>
                  <th className="text-left p-2 font-medium">Crypto</th>
                  <th className="text-left p-2 font-medium">Tx ID</th>
                  <th className="text-left p-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {paymentsQ.data?.map((p) => (
                  <tr key={p.id} className="border-t border-white/5">
                    <td className="p-2">{new Date(p.created_at!).toLocaleDateString()}</td>
                    <td className="p-2">{p.plans?.name ?? "—"}</td>
                    <td className="p-2 font-medium">${Number(p.amount).toFixed(2)}</td>
                    <td className="p-2 uppercase text-xs">{p.crypto_type ?? "—"}</td>
                    <td className="p-2 font-mono text-xs">{p.nowpayments_id ?? "—"}</td>
                    <td className="p-2">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-md text-xs font-medium border capitalize",
                          p.status === "confirmed" && "bg-success/15 text-success border-success/30",
                          p.status === "waiting" && "bg-warning/15 text-warning border-warning/30",
                          (p.status === "failed" || p.status === "expired") && "bg-destructive/15 text-destructive border-destructive/30",
                        )}
                      >
                        {p.status === "confirmed" && <Check className="w-3 h-3 inline mr-1" />}
                        {p.status === "waiting" && <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />}
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CryptoCheckoutModal plan={selectedPlan} open={!!selectedPlan} onOpenChange={(v) => !v && setSelectedPlan(null)} />
    </div>
  );
}
