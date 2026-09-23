/**
 * Single source of truth for plans, pricing options and capacity packages.
 * Every price, duration, capacity and active flag here comes from the database
 * (public.plans, public.plan_pricing_options, public.capacity_packages) so that
 * admin edits propagate everywhere without code changes.
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Crown, Rocket, Users, Zap, type LucideIcon } from "lucide-react";

export type PlanRow = {
  id: string;
  name: string;
  title: string | null;
  slug: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  duration_days: number | null;
  duration_value: number | null;
  duration_unit: string | null;
  is_unlimited: boolean | null;
  is_free: boolean | null;
  is_active: boolean | null;
  is_popular: boolean | null;
  color: string | null;
  sort_order: number | null;
  max_pcs: number | null;
  max_team_members: number | null;
  capacity_note: string | null;
  position_label: string | null;
};

export type PricingOptionRow = {
  id: string;
  plan_id: string;
  label: string | null;
  price: number;
  currency: string | null;
  duration_value: number;
  duration_unit: string;
  is_active: boolean | null;
  is_popular: boolean | null;
  sort_order: number | null;
};

export type CapacityPackageRow = {
  id: string;
  label: string | null;
  extra_pcs: number;
  price: number;
  currency: string | null;
  is_active: boolean | null;
  sort_order: number | null;
};

const UNIT_DAYS: Record<string, number> = {
  minutes: 1 / 1440,
  hours: 1 / 24,
  days: 1,
  weeks: 7,
  months: 30,
};

/** Converts any admin-chosen duration unit into whole days (never below 1). */
export function daysOf(value: number, unit: string | null | undefined): number {
  const factor = UNIT_DAYS[String(unit ?? "days").toLowerCase()] ?? 1;
  return Math.max(1, Math.ceil((Number(value) || 0) * factor));
}

/** Stable key for a duration/unit pair, used by the public duration selector. */
export function durationKey(value: number, unit: string | null | undefined) {
  return `${Number(value) || 0}:${String(unit ?? "days").toLowerCase()}`;
}

export function durationLabel(value: number, unit: string | null | undefined) {
  const n = Number(value) || 0;
  const u = String(unit ?? "days").toLowerCase();
  const singular = n === 1 ? u.replace(/s$/, "") : u;
  return `${n} ${singular.charAt(0).toUpperCase()}${singular.slice(1)}`;
}

function anyClient() {
  return supabase as never as typeof supabase;
}

export async function fetchPlans(activeOnly = true): Promise<PlanRow[]> {
  let query = supabase.from("plans").select("*").order("sort_order", { ascending: true });
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PlanRow[];
}

export async function fetchPricingOptions(): Promise<PricingOptionRow[]> {
  const { data, error } = await anyClient()
    .from("plan_pricing_options" as never)
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) return [];
  return (data ?? []) as unknown as PricingOptionRow[];
}

export async function fetchCapacityPackages(): Promise<CapacityPackageRow[]> {
  const { data, error } = await anyClient()
    .from("capacity_packages" as never)
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) return [];
  return (data ?? []) as unknown as CapacityPackageRow[];
}

/** Active pricing options for one plan, cheapest duration first. */
export function optionsForPlan(options: PricingOptionRow[] | undefined, planId: string) {
  return (options ?? [])
    .filter((o) => o.plan_id === planId && (o.is_active ?? true))
    .sort(
      (a, b) =>
        daysOf(a.duration_value, a.duration_unit) - daysOf(b.duration_value, b.duration_unit) ||
        (a.sort_order ?? 0) - (b.sort_order ?? 0),
    );
}

/** All distinct durations offered by any active option, cheapest first. */
export function availableDurations(options: PricingOptionRow[] | undefined) {
  const map = new Map<string, { key: string; value: number; unit: string; days: number; label: string }>();
  for (const option of options ?? []) {
    if (!(option.is_active ?? true)) continue;
    const key = durationKey(option.duration_value, option.duration_unit);
    if (map.has(key)) continue;
    map.set(key, {
      key,
      value: Number(option.duration_value),
      unit: String(option.duration_unit ?? "days"),
      days: daysOf(option.duration_value, option.duration_unit),
      label: durationLabel(option.duration_value, option.duration_unit),
    });
  }
  return [...map.values()].sort((a, b) => a.days - b.days);
}

/** Visual identity per plan; purely presentational, prices never live here. */
export type PlanStyle = {
  icon: LucideIcon;
  cardClass: string;
  iconClass: string;
  accentClass: string;
  buttonClass: string;
  barClass: string;
};

const STYLES: Record<string, PlanStyle> = {
  starter: {
    icon: Users,
    cardClass: "pricing-card--starter",
    iconClass: "bg-pricing-starter-soft text-pricing-starter",
    accentClass: "text-pricing-starter",
    buttonClass: "bg-pricing-starter text-pricing-starter-foreground hover:bg-pricing-starter/90",
    barClass: "w-[18%] bg-pricing-starter",
  },
  pro: {
    icon: Rocket,
    cardClass: "pricing-card--pro",
    iconClass: "bg-pricing-pro-soft text-pricing-pro",
    accentClass: "text-pricing-pro",
    buttonClass: "bg-pricing-pro text-pricing-pro-foreground hover:bg-pricing-pro/90",
    barClass: "w-[32%] bg-pricing-pro",
  },
  business: {
    icon: Building2,
    cardClass: "pricing-card--business",
    iconClass: "bg-pricing-business-soft text-pricing-business",
    accentClass: "text-pricing-business",
    buttonClass: "bg-pricing-business text-pricing-business-foreground hover:bg-pricing-business/90",
    barClass: "w-[58%] bg-pricing-business",
  },
  agency: {
    icon: Crown,
    cardClass: "pricing-card--agency",
    iconClass: "bg-pricing-agency-soft text-pricing-agency",
    accentClass: "text-pricing-agency",
    buttonClass: "bg-pricing-agency text-pricing-agency-foreground hover:bg-pricing-agency/90",
    barClass: "w-full bg-pricing-agency",
  },
};

const FALLBACK_STYLE: PlanStyle = {
  icon: Zap,
  cardClass: "pricing-card--pro",
  iconClass: "bg-primary/15 text-primary",
  accentClass: "text-primary",
  buttonClass: "bg-primary text-primary-foreground hover:bg-primary/90",
  barClass: "w-[45%] bg-primary",
};

export function planStyle(slug: string | null | undefined): PlanStyle {
  return STYLES[String(slug ?? "").toLowerCase()] ?? FALLBACK_STYLE;
}

/** Base PC capacity for a plan, straight from admin-editable columns. */
export function planCapacity(plan: PlanRow | undefined | null): number | null {
  const raw = plan?.max_team_members ?? plan?.max_pcs ?? null;
  return raw === null ? null : Number(raw);
}

/**
 * Loads the live catalogue and keeps it in sync with admin edits via Realtime.
 */
export function usePlanCatalog(opts?: { activeOnly?: boolean }) {
  const activeOnly = opts?.activeOnly ?? true;
  const qc = useQueryClient();

  const plansQ = useQuery({
    queryKey: ["plan-catalog", "plans", activeOnly],
    queryFn: () => fetchPlans(activeOnly),
  });
  const optionsQ = useQuery({
    queryKey: ["plan-catalog", "options"],
    queryFn: fetchPricingOptions,
  });
  const packagesQ = useQuery({
    queryKey: ["plan-catalog", "capacity-packages"],
    queryFn: fetchCapacityPackages,
  });

  useEffect(() => {
    const channel = supabase.channel(`plan-catalog-${Math.random().toString(36).slice(2)}`);
    const invalidate = () => void qc.invalidateQueries({ queryKey: ["plan-catalog"] });
    for (const table of ["plans", "plan_pricing_options", "capacity_packages"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, invalidate);
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  return { plansQ, optionsQ, packagesQ };
}
