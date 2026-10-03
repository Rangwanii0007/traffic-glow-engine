import type { SupabaseClient } from "@supabase/supabase-js";

const UNIT_DAYS: Record<string, number> = { minutes: 1 / 1440, hours: 1 / 24, days: 1, weeks: 7, months: 30 };
const toDays = (v: number, unit: string) => Math.max(1, Math.ceil(v * (UNIT_DAYS[String(unit || "days").toLowerCase()] ?? 1)));

export type ManualPackage = { planId: string; optionId: string | null; planName: string; label: string; price: number; days: number };

/** Resolves the exact package from the database — the only trusted price source. */
export async function resolvePackage(admin: SupabaseClient, planId: string, optionId: string | null): Promise<ManualPackage> {
  const { data: plan } = await admin.from("plans").select("id, name, slug, price, duration_days, is_active, is_free").eq("id", planId).maybeSingle();
  if (!plan) throw new Error("Package not found");
  if (String(plan.slug).toLowerCase() === "demo") throw new Error("Demo access can only be assigned by an admin");
  if (plan.is_free) throw new Error("Free plans cannot be purchased");
  if (!plan.is_active) throw new Error("This package is not available");
  let price = Number(plan.price) || 0;
  let days = Number(plan.duration_days) || 30;
  let label = String(plan.name);
  if (optionId) {
    const { data: o } = await admin.from("plan_pricing_options").select("*").eq("id", optionId).maybeSingle();
    if (!o || o.plan_id !== plan.id || o.is_active === false) throw new Error("Selected package option is not available");
    price = Number(o.price) || 0;
    days = toDays(Number(o.duration_value) || 1, o.duration_unit);
    label = `${plan.name} — ${o.label ?? `${o.duration_value} ${o.duration_unit}`}`;
  }
  if (price <= 0) throw new Error("This package has no price configured yet");
  return { planId: String(plan.id), optionId: optionId ?? null, planName: String(plan.name), label, price, days };
}

/** Live USD→currency rate. Fails closed: no fake/static fallback rates. */
export async function getUsdRate(currency: string) {
  const code = currency.toUpperCase();
  const fetchedAt = new Date().toISOString();
  if (code === "USD") return { currency: code, rate: 1, source: "fixed (USD)", fetchedAt };
  const sources: Array<[string, () => Promise<number | undefined>]> = [
    ["open.er-api.com", async () => {
      const r = await fetch("https://open.er-api.com/v6/latest/USD");
      if (!r.ok) return undefined;
      const j = (await r.json()) as { result?: string; rates?: Record<string, number> };
      return j.result === "success" ? j.rates?.[code] : undefined;
    }],
    ["fawazahmed0 currency-api", async () => {
      const r = await fetch("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json");
      if (!r.ok) return undefined;
      const j = (await r.json()) as { usd?: Record<string, number> };
      return j.usd?.[code.toLowerCase()];
    }],
  ];
  for (const [source, get] of sources) {
    try {
      const rate = await get();
      if (rate && Number.isFinite(rate) && rate > 0) return { currency: code, rate: Number(rate.toFixed(8)), source, fetchedAt };
    } catch { /* try next source */ }
  }
  throw new Error(`Live exchange rate for ${code} is unavailable right now. Please try again shortly.`);
}
