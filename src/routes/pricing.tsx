import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import {
  ArrowRight,
  BookOpen,
  Check,
  Gauge,
  Monitor,
  Plus,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { CryptoCheckoutModal } from "@/components/pricing/CryptoCheckoutModal";
import { Markdown } from "@/components/Markdown";
import { listPlanArticles, type PlanArticle } from "@/lib/plan-articles.functions";
import { cn } from "@/lib/utils";
import { PageGate } from "@/components/PageGate";
import { toast } from "sonner";
import {
  availableDurations,
  daysOf,
  durationKey,
  durationLabel,
  optionsForPlan,
  planCapacity,
  planStyle,
  usePlanCatalog,
  type PlanRow,
  type PricingOptionRow,
} from "@/lib/plan-catalog";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing Plans — AD4YOU" },
      { name: "description", content: "Choose an AD4YOU plan for your team and scale your managed PC capacity." },
      { property: "og:title", content: "AD4YOU Pricing Plans" },
      { property: "og:description", content: "Start free, build your team, and scale your operation with flexible AD4YOU plans." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <PageGate pageKey="page_pricing_enabled">
      <PricingPage />
    </PageGate>
  ),
});

const CORE_FEATURES = [
  "Team Management",
  "Worker Management",
  "PC Management",
  "Live Team Statistics",
  "Activity Tracking",
  "24/7 Support",
];

/** Widths for the capacity bar are relative to the largest published plan. */
function barWidth(capacity: number | null, maxCapacity: number) {
  if (!capacity || maxCapacity <= 0) return "35%";
  return `${Math.max(12, Math.min(100, Math.round((capacity / maxCapacity) * 100)))}%`;
}

function PricingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { plansQ, optionsQ, packagesQ } = usePlanCatalog();
  const [selectedDuration, setSelectedDuration] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<null | {
    id: string;
    name: string;
    slug: string;
    price: number;
    duration_days: number;
    pricingOptionId?: string | null;
    capacityPackageId?: string | null;
  }>(null);
  const [article, setArticle] = useState<PlanArticle | null>(null);

  const articlesQ = useQuery({
    queryKey: ["plan-articles"],
    queryFn: () => listPlanArticles(),
    staleTime: 60_000,
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
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("discount_offers")
        .select("*")
        .eq("is_active", true)
        .gt("seats_remaining", 0)
        .or(`starts_at.is.null,starts_at.lte.${now}`)
        .or(`ends_at.is.null,ends_at.gt.${now}`)
        .order("discount_percent", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  const queryClient = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("pricing-offers")
      .on("postgres_changes", { event: "*", schema: "public", table: "discount_offers" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["discount-offers-active"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  type OfferRow = NonNullable<typeof offersQ.data>[number];

  /** Paid, published plans only — the database decides which cards exist. */
  const plans = useMemo(
    () => (plansQ.data ?? []).filter((plan) => !plan.is_free),
    [plansQ.data],
  );

  const durations = useMemo(() => availableDurations(optionsQ.data), [optionsQ.data]);

  useEffect(() => {
    if (!durations.length) {
      if (selectedDuration !== null) setSelectedDuration(null);
      return;
    }
    if (!selectedDuration || !durations.some((d) => d.key === selectedDuration)) {
      setSelectedDuration(durations[0]!.key);
    }
  }, [durations, selectedDuration]);

  const maxCapacity = useMemo(
    () => plans.reduce((max, plan) => Math.max(max, planCapacity(plan) ?? 0), 0),
    [plans],
  );

  const articleFor = (slug: string) => articlesQ.data?.find((item) => item.plan_slug === slug) ?? null;
  const offerFor = (planId: string): OfferRow | null =>
    offersQ.data?.find((offer) => offer.plan_id === planId) ?? null;

  /**
   * Resolves the exact option the visitor is buying. Falls back to the plan's
   * own admin-set price and duration when it has no matching option.
   */
  function resolvePurchase(plan: PlanRow) {
    const options = optionsForPlan(optionsQ.data, plan.id);
    const option: PricingOptionRow | null =
      options.find((o) => durationKey(o.duration_value, o.duration_unit) === selectedDuration) ?? null;

    const listPrice = option ? Number(option.price) : Number(plan.price) || 0;
    const value = option ? Number(option.duration_value) : Number(plan.duration_value ?? plan.duration_days ?? 30);
    const unit = option ? option.duration_unit : plan.duration_unit ?? "days";
    const offer = offerFor(plan.id);
    const percent = offer ? Math.min(95, Math.max(0, Number(offer.discount_percent) || 0)) : 0;
    const finalPrice = Math.max(0, listPrice * (1 - percent / 100));

    return {
      option,
      hasOption: !!option,
      listPrice,
      finalPrice,
      offer,
      days: daysOf(value, unit),
      periodLabel: option?.label?.trim() || durationLabel(value, unit),
      currency: option?.currency ?? plan.currency ?? "USD",
    };
  }

  function handleBuyAddon(addon: { id: string; label: string | null; extra_pcs: number; price: number }) {
    if (!user) {
      navigate({ to: "/register" });
      return;
    }
    setSelectedPlan({
      id: "",
      name: addon.label ?? `+${Number(addon.extra_pcs).toLocaleString()} PCs`,
      slug: "extra-pcs",
      price: Number(addon.price),
      duration_days: 0,
      capacityPackageId: addon.id,
    });
  }

  function handleBuy(plan: PlanRow) {
    if (!user) {
      navigate({ to: "/register" });
      return;
    }
    const purchase = resolvePurchase(plan);
    if (purchase.listPrice <= 0) {
      toast.error(`${plan.title ?? plan.name} has no price configured yet.`);
      return;
    }
    const label = purchase.hasOption
      ? `${plan.name} — ${purchase.periodLabel}`
      : plan.name;
    setSelectedPlan({
      id: plan.id,
      name: purchase.offer ? `${label} — ${purchase.offer.discount_percent}% OFF` : label,
      slug: plan.slug,
      // Display only: the server re-reads the price from the database.
      price: Number(purchase.finalPrice.toFixed(2)),
      duration_days: purchase.days,
      pricingOptionId: purchase.option?.id ?? null,
    });
  }

  const capacityPackages = useMemo(
    () => (packagesQ.data ?? []).filter((p) => (p.is_active ?? true) && Number(p.extra_pcs) > 0),
    [packagesQ.data],
  );

  const loading = plansQ.isLoading || optionsQ.isLoading;

  return (
    <div className="pricing-page min-h-screen overflow-x-clip bg-background text-foreground">
      <Navbar />

      <main>
        <section className="pricing-hero relative px-4 pb-14 pt-32 sm:pb-20 sm:pt-40">
          <div className="pricing-grid absolute inset-0" aria-hidden="true" />
          <div className="relative mx-auto max-w-4xl text-center">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-pricing-line bg-pricing-surface/70 px-4 py-2 text-xs font-bold uppercase text-pricing-eyebrow backdrop-blur-xl"
            >
              <span className="grid size-6 place-items-center rounded-md bg-primary/15 text-primary"><Zap className="size-3.5" /></span>
              AD4YOU
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              className="font-display text-4xl font-bold sm:text-6xl lg:text-7xl"
            >
              Choose Your <span className="pricing-title-accent">Plan</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.14 }}
              className="mx-auto mt-5 max-w-2xl text-lg font-medium text-foreground/85 sm:text-xl"
            >
              Start free. Build your team. Scale your operation.
            </motion.p>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Every paid plan includes team management. Your plan determines how many PCs your team can manage.
            </p>

            {durations.length > 1 && (
              <>
                <div
                  className="mx-auto mt-9 flex w-full max-w-md flex-wrap items-center gap-1 rounded-xl border border-pricing-line bg-pricing-surface/80 p-1.5 shadow-2xl backdrop-blur-xl"
                  role="group"
                  aria-label="Billing duration"
                >
                  {durations.map((item) => (
                    <Button
                      key={item.key}
                      type="button"
                      variant="ghost"
                      aria-pressed={selectedDuration === item.key}
                      onClick={() => setSelectedDuration(item.key)}
                      className={cn(
                        "h-11 min-w-24 flex-1 rounded-lg text-sm font-bold transition-all",
                        selectedDuration === item.key
                          ? "bg-primary text-primary-foreground shadow-lg hover:bg-primary/90"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                      )}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Longer plans include built-in savings.</p>
              </>
            )}
          </div>
        </section>

        {offersQ.data && offersQ.data.length > 0 && (
          <section className="px-4 pb-8" aria-label="Active discounts">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-5 gap-y-2 rounded-xl border border-success/25 bg-success/5 px-4 py-3 text-center text-sm">
              <span className="inline-flex items-center gap-2 font-bold text-success"><Sparkles className="size-4" /> Active savings applied automatically</span>
              <span className="text-muted-foreground">Valid offers appear directly on the matching plan.</span>
            </div>
          </section>
        )}

        <section className="px-4 pb-20" aria-label="Pricing plans">
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4 xl:items-stretch">
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[650px] rounded-lg" />)
            ) : plans.length === 0 ? (
              <p className="col-span-full py-16 text-center text-muted-foreground">
                No plans are published right now. Please check back shortly.
              </p>
            ) : (
              plans.map((plan, index) => {
                const style = planStyle(plan.slug);
                const PlanIcon = style.icon;
                const purchase = resolvePurchase(plan);
                const capacity = planCapacity(plan);
                const info = articleFor(plan.slug);
                return (
                  <motion.article
                    key={plan.id}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ duration: 0.45, delay: index * 0.06 }}
                    whileHover={{ y: -6 }}
                    className={cn("pricing-card relative flex min-h-[650px] flex-col rounded-lg p-5 sm:p-6", style.cardClass)}
                  >
                    {plan.is_popular && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-pricing-business px-4 py-1.5 text-[10px] font-black uppercase text-pricing-business-foreground shadow-lg">
                        Recommended
                      </span>
                    )}
                    <div className="flex items-start justify-between gap-3">
                      <div className={cn("grid size-12 place-items-center rounded-xl", style.iconClass)}>
                        <PlanIcon className="size-6" strokeWidth={1.8} />
                      </div>
                      {(plan.position_label || plan.description) && (
                        <span className="rounded-full border border-pricing-line bg-background/40 px-2.5 py-1 text-[10px] font-bold uppercase text-muted-foreground">
                          {plan.position_label ?? plan.description}
                        </span>
                      )}
                    </div>

                    <div className="mt-6">
                      <h2 className={cn("font-display text-sm font-black uppercase", style.accentClass)}>
                        {plan.title ?? plan.name}
                      </h2>
                      <div className="mt-3 flex min-h-16 items-end gap-2">
                        {purchase.offer && (
                          <span className="mb-2 text-base text-muted-foreground line-through">
                            ${Number(purchase.listPrice.toFixed(2))}
                          </span>
                        )}
                        <motion.span
                          key={`${plan.id}-${selectedDuration}-${purchase.finalPrice}`}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="font-display text-5xl font-bold tabular-nums"
                        >
                          ${Number(purchase.finalPrice.toFixed(2))}
                        </motion.span>
                        <span className="mb-2 text-sm text-muted-foreground">/ {purchase.periodLabel}</span>
                      </div>
                      {purchase.offer ? (
                        <div className="mt-3 rounded-md border border-success/25 bg-success/10 px-3 py-2 text-xs">
                          <p className="font-bold text-success">
                            {purchase.offer.discount_percent}% OFF · Save ${(purchase.listPrice - purchase.finalPrice).toFixed(2)}
                          </p>
                          <p className="mt-0.5 truncate text-muted-foreground">
                            {purchase.offer.title}
                            {purchase.offer.coupon_code ? ` · ${purchase.offer.coupon_code} applied` : ""}
                          </p>
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-muted-foreground">One clear price. Full team access included.</p>
                      )}
                    </div>

                    <div className="my-5 rounded-lg border border-pricing-line bg-background/35 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Team capacity</p>
                          <p className="mt-1 font-display text-2xl font-bold">
                            {capacity ? `${capacity.toLocaleString()} PCs` : "—"}
                          </p>
                        </div>
                        <div className={cn("grid size-10 place-items-center rounded-lg", style.iconClass)}><Monitor className="size-5" /></div>
                      </div>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div
                          className={cn("h-full rounded-full shadow-lg", style.barClass.replace(/^w-\[[^\]]+\]\s*/, "").replace(/^w-full\s*/, ""))}
                          style={{ width: barWidth(capacity, maxCapacity) }}
                        />
                      </div>
                      {plan.capacity_note && (
                        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Gauge className="size-3.5" /> {plan.capacity_note}
                        </p>
                      )}
                    </div>

                    <ul className="flex-1 space-y-3 text-sm">
                      {CORE_FEATURES.map((feature) => (
                        <li key={feature} className="flex items-center gap-2.5">
                          <span className={cn("grid size-5 shrink-0 place-items-center rounded-full", style.iconClass)}><Check className="size-3" strokeWidth={3} /></span>
                          <span className="text-foreground/85">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-6 space-y-2">
                      <Button onClick={() => handleBuy(plan)} className={cn("h-12 w-full rounded-lg font-bold", style.buttonClass)}>
                        Choose {plan.title ?? plan.name}<ArrowRight className="ml-1 size-4" />
                      </Button>
                      {info && (
                        <Button variant="ghost" onClick={() => setArticle(info)} className="h-10 w-full text-xs text-muted-foreground hover:text-foreground">
                          <BookOpen className="mr-2 size-3.5" /> Package info & earning guide
                        </Button>
                      )}
                    </div>
                  </motion.article>
                );
              })
            )}
          </div>
        </section>

        {capacityPackages.length > 0 && (
          <section className="border-y border-pricing-line bg-pricing-band px-4 py-16 sm:py-20">
            <div className="mx-auto max-w-6xl">
              <div className="flex flex-col gap-4 text-center sm:flex-row sm:items-end sm:justify-between sm:text-left">
                <div>
                  <p className="text-xs font-black uppercase text-pricing-eyebrow">Flexible capacity</p>
                  <h2 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Need More PCs?</h2>
                  <p className="mt-2 text-muted-foreground">Add extra PC capacity to your current subscription.</p>
                </div>
                <div className="inline-flex items-center justify-center gap-2 text-sm text-success"><ShieldCheck className="size-4" /> Added to your active plan</div>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {capacityPackages.map((addon) => (
                  <button type="button" key={addon.id} onClick={() => handleBuyAddon(addon)} className="pricing-addon flex items-center justify-between rounded-lg border border-pricing-line bg-pricing-surface p-5 text-left transition-colors hover:border-accent">
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 place-items-center rounded-lg bg-accent/15 text-accent"><Plus className="size-5" /></span>
                      <span className="font-display text-lg font-bold">
                        {addon.label ?? `+${Number(addon.extra_pcs).toLocaleString()} PCs`}
                      </span>
                    </div>
                    <span className="text-right">
                      <span className="block font-display text-2xl font-bold text-accent">${Number(addon.price).toFixed(0)}</span>
                      <span className="text-xs font-semibold text-muted-foreground">Buy now</span>
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
                Extra PC capacity is valid for the remaining period of your current subscription.
              </p>
            </div>
          </section>
        )}

        {plans.length > 0 && (
          <section className="px-4 py-20 sm:py-24">
            <div className="mx-auto max-w-6xl">
              <div className="mb-8 text-center">
                <p className="text-xs font-black uppercase text-pricing-eyebrow">Every detail, side by side</p>
                <h2 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Full Feature Comparison</h2>
                <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">Compare every available capability before choosing your team capacity.</p>
              </div>

              <div className="overflow-hidden rounded-lg border border-pricing-line bg-pricing-surface shadow-2xl">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-pricing-band">
                      <tr className="border-b border-pricing-line">
                        <th className="sticky left-0 z-10 bg-pricing-band p-4 text-left font-semibold text-muted-foreground">Feature</th>
                        {plans.map((plan) => (
                          <th key={plan.id} className={cn("p-4 text-center font-display font-bold", planStyle(plan.slug).accentClass)}>
                            {plan.title ?? plan.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-pricing-line bg-background/20">
                        <td className="sticky left-0 bg-pricing-surface p-4 font-semibold">PC capacity</td>
                        {plans.map((plan) => {
                          const capacity = planCapacity(plan);
                          return (
                            <td key={plan.id} className="p-4 text-center font-bold">
                              {capacity ? `${capacity.toLocaleString()} PCs` : "—"}
                            </td>
                          );
                        })}
                      </tr>
                      {featuresQ.data?.map((feature) => (
                        <tr key={feature.id} className="border-b border-pricing-line last:border-0 hover:bg-secondary/25">
                          <td className="sticky left-0 bg-pricing-surface p-4 font-medium">{feature.feature_name}</td>
                          {plans.map((plan) => {
                            const column = `${String(plan.slug).toLowerCase()}_value`;
                            const raw = (feature as unknown as Record<string, string | null>)[column];
                            if (raw === undefined || raw === null || raw === "") {
                              return <td key={plan.id} className="p-4 text-center text-muted-foreground">—</td>;
                            }
                            if (feature.feature_type === "boolean") {
                              return (
                                <td key={plan.id} className="p-4 text-center">
                                  {raw === "true" ? <Check className="mx-auto size-4 text-success" /> : <X className="mx-auto size-4 text-muted-foreground/50" />}
                                </td>
                              );
                            }
                            return <td key={plan.id} className="p-4 text-center font-medium">{Number(raw) >= 999999 ? "∞" : raw}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="px-4 pb-24">
          <div className="pricing-final-cta mx-auto max-w-5xl overflow-hidden rounded-lg border border-pricing-line px-5 py-10 text-center sm:px-10 sm:py-14">
            <p className="text-xs font-black uppercase text-pricing-eyebrow">Your team starts here</p>
            <h2 className="mt-3 font-display text-3xl font-bold sm:text-5xl">Ready to scale your operation?</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">Choose the capacity that fits today. Grow when your operation does.</p>
            <Button asChild className="mt-7 h-12 rounded-lg bg-primary px-7 font-bold text-primary-foreground hover:bg-primary/90">
              <Link to="/register">Start Building Your Team <ArrowRight className="ml-1 size-4" /></Link>
            </Button>
            <p className="mt-5 text-sm text-muted-foreground">Already have an account? <Link to="/login" className="font-bold text-foreground hover:text-primary">Sign in</Link></p>
          </div>
        </section>
      </main>

      <Footer />

      <CryptoCheckoutModal plan={selectedPlan} open={!!selectedPlan} onOpenChange={(open) => !open && setSelectedPlan(null)} />

      <Dialog open={!!article} onOpenChange={(open) => !open && setArticle(null)}>
        <DialogContent className="max-h-[88vh] w-[calc(100vw-1.5rem)] max-w-3xl overflow-y-auto border-pricing-line bg-popover sm:w-full">
          <DialogHeader>
            <DialogTitle className="text-left font-display text-xl font-bold sm:text-2xl">
              <span className="mr-2">{article?.emoji ?? ""}</span>{article?.title}
            </DialogTitle>
            {article?.subtitle && <p className="text-left text-sm text-muted-foreground">{article.subtitle}</p>}
          </DialogHeader>
          {article?.hero_image_url && <img src={article.hero_image_url} alt={article.title} loading="lazy" className="w-full rounded-lg border border-pricing-line" />}
          {article && <Markdown content={article.content} />}
          <div className="sticky bottom-0 -mx-6 mt-4 border-t border-pricing-line bg-popover/95 px-6 py-4 backdrop-blur-xl">
            <Button
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => {
                const plan = plans.find((item) => item.slug === article?.plan_slug);
                setArticle(null);
                if (plan) handleBuy(plan);
              }}
            >
              Get this package now
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
