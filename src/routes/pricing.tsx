import { useEffect, useMemo, useState, type ComponentType } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import {
  ArrowRight,
  BookOpen,
  Building2,
  Check,
  Crown,
  Gauge,
  Monitor,
  Plus,
  Rocket,
  ShieldCheck,
  Sparkles,
  Users,
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

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing Plans — AD4YOU" },
      { name: "description", content: "Choose an AD4YOU plan for your team, from 20 to 1,000 managed PCs." },
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

type PlanRow = {
  id: string;
  name: string;
  title: string | null;
  slug: string;
  price: number | null;
  duration_days: number | null;
  sort_order: number | null;
  max_team_members: number | null;
  capacity_note: string | null;
  position_label: string | null;
};

type PricingOptionRow = {
  id: string;
  plan_id: string;
  label: string;
  price: number;
  duration_value: number;
  duration_unit: string;
  is_active: boolean | null;
};

const DURATIONS = [30, 60, 90] as const;
type Duration = (typeof DURATIONS)[number];
type FeatureSlug = "starter" | "pro" | "business";

type PlanSpec = {
  slug: "starter" | "pro" | "business" | "agency";
  name: string;
  position: string;
  capacity: string;
  capacityNote: string;
  prices: Record<Duration, number>;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  featureSlug: FeatureSlug | null;
  cardClass: string;
  iconClass: string;
  accentClass: string;
  buttonClass: string;
  capacityClass: string;
  recommended?: boolean;
};

const PLAN_SPECS: PlanSpec[] = [
  {
    slug: "starter",
    name: "Starter",
    position: "For small teams",
    capacity: "20 PCs",
    capacityNote: "A focused start",
    prices: { 30: 35, 60: 65, 90: 90 },
    icon: Users,
    featureSlug: "starter",
    cardClass: "pricing-card--starter",
    iconClass: "bg-pricing-starter-soft text-pricing-starter",
    accentClass: "text-pricing-starter",
    buttonClass: "bg-pricing-starter text-pricing-starter-foreground hover:bg-pricing-starter/90",
    capacityClass: "w-[18%] bg-pricing-starter",
  },
  {
    slug: "pro",
    name: "Pro",
    position: "For growing teams",
    capacity: "50 PCs",
    capacityNote: "Built for momentum",
    prices: { 30: 60, 60: 110, 90: 155 },
    icon: Rocket,
    featureSlug: "pro",
    cardClass: "pricing-card--pro",
    iconClass: "bg-pricing-pro-soft text-pricing-pro",
    accentClass: "text-pricing-pro",
    buttonClass: "bg-pricing-pro text-pricing-pro-foreground hover:bg-pricing-pro/90",
    capacityClass: "w-[32%] bg-pricing-pro",
  },
  {
    slug: "business",
    name: "Business",
    position: "For scaling operations",
    capacity: "200 PCs",
    capacityNote: "Room to scale",
    prices: { 30: 120, 60: 220, 90: 315 },
    icon: Building2,
    featureSlug: "business",
    cardClass: "pricing-card--business",
    iconClass: "bg-pricing-business-soft text-pricing-business",
    accentClass: "text-pricing-business",
    buttonClass: "bg-pricing-business text-pricing-business-foreground hover:bg-pricing-business/90",
    capacityClass: "w-[58%] bg-pricing-business",
    recommended: true,
  },
  {
    slug: "agency",
    name: "Agency",
    position: "For large-scale operations",
    capacity: "1,000 PCs",
    capacityNote: "Enterprise capacity",
    prices: { 30: 250, 60: 450, 90: 625 },
    icon: Crown,
    featureSlug: null,
    cardClass: "pricing-card--agency",
    iconClass: "bg-pricing-agency-soft text-pricing-agency",
    accentClass: "text-pricing-agency",
    buttonClass: "bg-pricing-agency text-pricing-agency-foreground hover:bg-pricing-agency/90",
    capacityClass: "w-full bg-pricing-agency",
  },
];

const CORE_FEATURES = [
  "Team Management",
  "Worker Management",
  "PC Management",
  "Live Team Statistics",
  "Activity Tracking",
  "24/7 Support",
];

function PricingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [duration, setDuration] = useState<Duration>(30);
  const [selectedPlan, setSelectedPlan] = useState<null | { id: string; name: string; slug: string; price: number; duration_days: number }>(null);
  const [article, setArticle] = useState<PlanArticle | null>(null);

  const articlesQ = useQuery({
    queryKey: ["plan-articles"],
    queryFn: () => listPlanArticles(),
    staleTime: 60_000,
  });

  const plansQ = useQuery({
    queryKey: ["plans-public"],
    queryFn: async () => {
      const { data } = await supabase.from("plans").select("*").eq("is_active", true).order("sort_order");
      return (data ?? []) as unknown as PlanRow[];
    },
  });

  const optionsQ = useQuery({
    queryKey: ["plan-pricing-options-public"],
    queryFn: async () => {
      const { data } = await (supabase as never as typeof supabase)
        .from("plan_pricing_options" as never)
        .select("*")
        .order("sort_order");
      return (data ?? []) as unknown as PricingOptionRow[];
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
      .on("postgres_changes", { event: "*", schema: "public", table: "plan_pricing_options" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["plan-pricing-options-public"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "plans" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["plans-public"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  type OfferRow = NonNullable<typeof offersQ.data>[number];

  const plansBySlug = useMemo(() => {
    const map = new Map<string, PlanRow>();
    plansQ.data?.forEach((plan) => map.set(String(plan.slug).toLowerCase(), plan));
    return map;
  }, [plansQ.data]);

  const articleFor = (slug: string) => articlesQ.data?.find((item) => item.plan_slug === slug) ?? null;
  const offerFor = (planId?: string): OfferRow | null =>
    planId ? offersQ.data?.find((offer) => offer.plan_id === planId) ?? null : null;

  /** Admin-defined 30/60/90 day option for a plan; falls back to the built-in price. */
  const optionFor = (planId: string | undefined, days: number): PricingOptionRow | null => {
    if (!planId) return null;
    return (
      optionsQ.data?.find(
        (o) =>
          o.plan_id === planId &&
          o.duration_unit === "days" &&
          Number(o.duration_value) === days &&
          (o.is_active ?? true),
      ) ?? null
    );
  };

  const capacityOf = (spec: PlanSpec, plan?: PlanRow) =>
    plan?.max_team_members ? `${Number(plan.max_team_members).toLocaleString()} PCs` : spec.capacity;

  function displayedPrice(spec: PlanSpec, plan?: PlanRow) {
    const option = optionFor(plan?.id, duration);
    const base = option ? Number(option.price) : spec.prices[duration];
    const offer = offerFor(plan?.id);
    if (!offer) return { base, final: base, offer: null as OfferRow | null };
    return {
      base,
      final: Math.max(0, base * (1 - Number(offer.discount_percent) / 100)),
      offer,
    };
  }

  function handleBuy(spec: PlanSpec) {
    const plan = plansBySlug.get(spec.slug);
    if (!plan) {
      toast.error(`${spec.name} is not published yet. Please try again shortly.`);
      return;
    }
    if (!user) {
      navigate({ to: "/register" });
      return;
    }
    const offer = offerFor(plan.id);
    const option = optionFor(plan.id, duration);
    const listPrice = option ? Number(option.price) : Number(plan.price) || 0;
    const checkoutPrice = offer
      ? Math.max(0, listPrice * (1 - Number(offer.discount_percent) / 100))
      : listPrice;
    const label = option ? `${plan.name} — ${option.label}` : plan.name;
    setSelectedPlan({
      id: plan.id,
      name: offer ? `${label} — ${offer.discount_percent}% OFF` : label,
      slug: plan.slug,
      price: Number(checkoutPrice.toFixed(2)),
      duration_days: option ? Number(option.duration_value) : plan.duration_days ?? 30,
      pricingOptionId: option?.id ?? null,
    });
  }

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

            <div className="mx-auto mt-9 flex w-full max-w-md items-center rounded-xl border border-pricing-line bg-pricing-surface/80 p-1.5 shadow-2xl backdrop-blur-xl" role="group" aria-label="Billing duration">
              {DURATIONS.map((item) => (
                <Button
                  key={item}
                  type="button"
                  variant="ghost"
                  aria-pressed={duration === item}
                  onClick={() => setDuration(item)}
                  className={cn(
                    "h-11 flex-1 rounded-lg text-sm font-bold transition-all",
                    duration === item
                      ? "bg-primary text-primary-foreground shadow-lg hover:bg-primary/90"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  {item} Days
                </Button>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Longer plans include built-in savings.</p>
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
            {plansQ.isLoading
              ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[650px] rounded-lg" />)
              : PLAN_SPECS.map((spec, index) => {
                  const plan = plansBySlug.get(spec.slug);
                  const { base, final, offer } = displayedPrice(spec, plan);
                  const PlanIcon = spec.icon;
                  const info = articleFor(spec.slug);
                  return (
                    <motion.article
                      key={spec.slug}
                      initial={{ opacity: 0, y: 24 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: "-60px" }}
                      transition={{ duration: 0.45, delay: index * 0.06 }}
                      whileHover={{ y: -6 }}
                      className={cn("pricing-card relative flex min-h-[650px] flex-col rounded-lg p-5 sm:p-6", spec.cardClass)}
                    >
                      {spec.recommended && (
                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-pricing-business px-4 py-1.5 text-[10px] font-black uppercase text-pricing-business-foreground shadow-lg">
                          Recommended
                        </span>
                      )}
                      <div className="flex items-start justify-between gap-3">
                        <div className={cn("grid size-12 place-items-center rounded-xl", spec.iconClass)}>
                          <PlanIcon className="size-6" strokeWidth={1.8} />
                        </div>
                        <span className="rounded-full border border-pricing-line bg-background/40 px-2.5 py-1 text-[10px] font-bold uppercase text-muted-foreground">
                          {plan?.position_label ?? spec.position}
                        </span>
                      </div>

                      <div className="mt-6">
                        <h2 className={cn("font-display text-sm font-black uppercase", spec.accentClass)}>{spec.name}</h2>
                        <div className="mt-3 flex min-h-16 items-end gap-2">
                          {offer && <span className="mb-2 text-base text-muted-foreground line-through">${base}</span>}
                          <motion.span
                            key={`${spec.slug}-${duration}-${final}`}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="font-display text-5xl font-bold tabular-nums"
                          >
                            ${Number(final.toFixed(2))}
                          </motion.span>
                          <span className="mb-2 text-sm text-muted-foreground">/ {duration} days</span>
                        </div>
                        {offer ? (
                          <div className="mt-3 rounded-md border border-success/25 bg-success/10 px-3 py-2 text-xs">
                            <p className="font-bold text-success">{offer.discount_percent}% OFF · Save ${(base - final).toFixed(2)}</p>
                            <p className="mt-0.5 truncate text-muted-foreground">{offer.title}{offer.coupon_code ? ` · ${offer.coupon_code} applied` : ""}</p>
                          </div>
                        ) : (
                          <p className="mt-3 text-xs text-muted-foreground">One clear price. Full team access included.</p>
                        )}
                      </div>

                      <div className="my-5 rounded-lg border border-pricing-line bg-background/35 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">Team capacity</p>
                            <p className="mt-1 font-display text-2xl font-bold">{capacityOf(spec, plan)}</p>
                          </div>
                          <div className={cn("grid size-10 place-items-center rounded-lg", spec.iconClass)}><Monitor className="size-5" /></div>
                        </div>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
                          <div className={cn("h-full rounded-full shadow-lg", spec.capacityClass)} />
                        </div>
                        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground"><Gauge className="size-3.5" /> {plan?.capacity_note ?? spec.capacityNote}</p>
                      </div>

                      <ul className="flex-1 space-y-3 text-sm">
                        {CORE_FEATURES.map((feature) => (
                          <li key={feature} className="flex items-center gap-2.5">
                            <span className={cn("grid size-5 shrink-0 place-items-center rounded-full", spec.iconClass)}><Check className="size-3" strokeWidth={3} /></span>
                            <span className="text-foreground/85">{feature}</span>
                          </li>
                        ))}
                      </ul>

                      <div className="mt-6 space-y-2">
                        <Button onClick={() => handleBuy(spec)} className={cn("h-12 w-full rounded-lg font-bold", spec.buttonClass)}>
                          Choose {spec.name}<ArrowRight className="ml-1 size-4" />
                        </Button>
                        {info && (
                          <Button variant="ghost" onClick={() => setArticle(info)} className="h-10 w-full text-xs text-muted-foreground hover:text-foreground">
                            <BookOpen className="mr-2 size-3.5" /> Package info & earning guide
                          </Button>
                        )}
                      </div>
                    </motion.article>
                  );
                })}
          </div>
        </section>

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
              {[
                { pcs: "+100 PCs", price: "$30" },
                { pcs: "+200 PCs", price: "$60" },
                { pcs: "+300 PCs", price: "$90" },
              ].map((addon) => (
                <div key={addon.pcs} className="pricing-addon flex items-center justify-between rounded-lg border border-pricing-line bg-pricing-surface p-5">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-lg bg-accent/15 text-accent"><Plus className="size-5" /></span>
                    <span className="font-display text-lg font-bold">{addon.pcs}</span>
                  </div>
                  <span className="font-display text-2xl font-bold text-accent">{addon.price}</span>
                </div>
              ))}
            </div>
            <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
              Extra PC capacity is valid for the remaining period of your current subscription.
            </p>
          </div>
        </section>

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
                      {PLAN_SPECS.map((spec) => (
                        <th key={spec.slug} className={cn("p-4 text-center font-display font-bold", spec.accentClass)}>{spec.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-pricing-line bg-background/20">
                      <td className="sticky left-0 bg-pricing-surface p-4 font-semibold">PC capacity</td>
                      {PLAN_SPECS.map((spec) => (
                        <td key={spec.slug} className="p-4 text-center font-bold">
                          {capacityOf(spec, plansBySlug.get(spec.slug))}
                        </td>
                      ))}
                    </tr>
                    {featuresQ.data?.map((feature) => (
                      <tr key={feature.id} className="border-b border-pricing-line last:border-0 hover:bg-secondary/25">
                        <td className="sticky left-0 bg-pricing-surface p-4 font-medium">{feature.feature_name}</td>
                        {PLAN_SPECS.map((spec) => {
                          if (!spec.featureSlug) return <td key={spec.slug} className="p-4 text-center text-muted-foreground">—</td>;
                          const raw = feature[`${spec.featureSlug}_value` as `${FeatureSlug}_value`] as string;
                          if (feature.feature_type === "boolean") {
                            return (
                              <td key={spec.slug} className="p-4 text-center">
                                {raw === "true" ? <Check className="mx-auto size-4 text-success" /> : <X className="mx-auto size-4 text-muted-foreground/50" />}
                              </td>
                            );
                          }
                          return <td key={spec.slug} className="p-4 text-center font-medium">{Number(raw) >= 999999 ? "∞" : raw}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

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
                const spec = PLAN_SPECS.find((item) => item.slug === article?.plan_slug);
                setArticle(null);
                if (spec) handleBuy(spec);
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