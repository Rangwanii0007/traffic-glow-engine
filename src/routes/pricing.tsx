import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, X, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { CryptoCheckoutModal } from "@/components/pricing/CryptoCheckoutModal";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — AD4YOU" },
      { name: "description", content: "Simple, transparent pricing. Pay in crypto. Cancel anytime." },
      { property: "og:title", content: "AD4YOU Pricing" },
      { property: "og:description", content: "Choose the plan that fits your traffic goals." },
    ],
  }),
  component: PricingPage,
});

const SLUGS = ["free", "starter", "pro", "business"] as const;
type Slug = (typeof SLUGS)[number];

function PricingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState<null | { id: string; name: string; slug: string; price: number; duration_days: number }>(null);

  const plansQ = useQuery({
    queryKey: ["plans-public"],
    queryFn: async () => {
      const { data } = await supabase.from("plans").select("*").eq("is_active", true).order("sort_order");
      return data ?? [];
    },
  });

  const featuresQ = useQuery({
    queryKey: ["plan-features-public"],
    queryFn: async () => {
      const { data } = await supabase.from("plan_features").select("*").eq("is_visible", true).order("sort_order");
      return data ?? [];
    },
  });

  const offersQ = useQuery({
    queryKey: ["discount-offers-active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("discount_offers")
        .select("*, plans:plan_id(name, slug)")
        .eq("is_active", true)
        .gt("seats_remaining", 0)
        .order("discount_percent", { ascending: false });
      return data ?? [];
    },
  });


  type PlanRow = NonNullable<typeof plansQ.data>[number];
  function handleBuy(plan: PlanRow) {
    if (plan.is_free || Number(plan.price) <= 0) {
      navigate({ to: "/register" });
      return;
    }
    if (!user) {
      navigate({ to: "/register" });
      return;
    }
    setSelectedPlan({
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      price: Number(plan.price),
      duration_days: plan.duration_days ?? 30,
    });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />

      {/* hero */}
      <section className="relative pt-32 pb-16 px-4 text-center overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,oklch(0.3_0.18_295_/_30%),transparent_70%)]" />
        <div className="relative max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-xs font-medium text-primary mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            Crypto-only. No card, no fees, no leaks.
          </div>
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight">
            Choose your <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">plan</span>
          </h1>
          <p className="text-muted-foreground mt-5 text-lg">
            Start free, scale on demand. Pay with Bitcoin, Ethereum, USDT and more.
          </p>
        </div>
      </section>

      {/* plan cards */}
      <section className="px-4 pb-16">
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {plansQ.isLoading
            ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[520px] rounded-3xl" />)
            : plansQ.data?.map((plan) => {
                const slug = plan.slug as Slug;
                return (
                  <div
                    key={plan.id}
                    className={cn(
                      "relative glass-card rounded-3xl p-6 flex flex-col",
                      plan.is_popular && "ring-2 ring-primary shadow-[0_0_60px_rgba(139,92,246,0.3)] scale-[1.02]",
                    )}
                  >
                    {plan.is_popular && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-primary to-accent text-white shadow-lg">
                        Most Popular
                      </span>
                    )}
                    <h3 className="font-bold text-xl" style={{ color: plan.color ?? undefined }}>{plan.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1 min-h-[2.5rem]">{plan.description}</p>
                    <div className="my-5">
                      <p className="text-4xl font-bold">
                        ${Number(plan.price).toFixed(2)}
                        <span className="text-sm text-muted-foreground font-normal">
                          {plan.duration_days === 0 ? "/forever" : "/month"}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {plan.duration_days === 0 ? "Unlimited" : `${plan.duration_days} days`}
                      </p>
                    </div>
                    <Button
                      onClick={() => handleBuy(plan)}
                      className={cn(
                        "w-full mb-5",
                        plan.is_popular
                          ? "bg-gradient-to-r from-primary to-accent text-white hover:opacity-90"
                          : "bg-white/10 text-white hover:bg-white/15",
                      )}
                    >
                      {plan.is_free ? "Get started free" : "Buy now"}
                    </Button>
                    <ul className="space-y-2.5 text-sm flex-1">
                      {featuresQ.data?.map((f) => {
                        const raw = f[`${slug}_value` as `${Slug}_value`] as string;
                        if (f.feature_type === "boolean") {
                          const on = raw === "true";
                          return (
                            <li key={f.id} className={cn("flex items-center gap-2", !on && "opacity-50")}>
                              {on ? <Check className="w-4 h-4 text-success shrink-0" /> : <X className="w-4 h-4 text-muted-foreground shrink-0" />}
                              <span>{f.feature_name}</span>
                            </li>
                          );
                        }
                        return (
                          <li key={f.id} className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-primary shrink-0" />
                            <span>
                              {f.feature_name}: <strong>{Number(raw) >= 999999 ? "Unlimited" : raw}</strong>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
        </div>
      </section>

      {/* comparison table */}
      <section className="px-4 pb-24">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8">Full feature comparison</h2>
          <div className="glass-card rounded-3xl overflow-hidden overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="sticky top-0 bg-card/95 backdrop-blur">
                <tr className="border-b border-white/10">
                  <th className="text-left p-4 font-medium text-muted-foreground">Feature</th>
                  {plansQ.data?.map((p) => (
                    <th key={p.id} className="p-4 font-semibold text-center" style={{ color: p.color ?? undefined }}>
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {featuresQ.data?.map((f) => (
                  <tr key={f.id} className="border-b border-white/5">
                    <td className="p-4 font-medium">{f.feature_name}</td>
                    {SLUGS.map((slug) => {
                      const raw = f[`${slug}_value` as `${Slug}_value`] as string;
                      if (f.feature_type === "boolean") {
                        return (
                          <td key={slug} className="p-4 text-center">
                            {raw === "true" ? (
                              <Check className="w-4 h-4 text-success mx-auto" />
                            ) : (
                              <X className="w-4 h-4 text-muted-foreground/50 mx-auto" />
                            )}
                          </td>
                        );
                      }
                      return (
                        <td key={slug} className="p-4 text-center font-medium">
                          {Number(raw) >= 999999 ? "∞" : raw}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-center text-xs text-muted-foreground mt-6">
            Already have an account? <Link to="/login" className="text-primary hover:underline">Sign in</Link>
          </p>
        </div>
      </section>

      <Footer />

      <CryptoCheckoutModal plan={selectedPlan} open={!!selectedPlan} onOpenChange={(v) => !v && setSelectedPlan(null)} />
    </div>
  );
}
