/** Shared PC capacity maths used by the dashboard, admin panel and team limits. */

export type CapacityAddonRow = {
  id: string;
  user_id: string;
  extra_pcs: number;
  price: number | null;
  currency: string | null;
  label: string | null;
  note: string | null;
  starts_at: string;
  expires_at: string | null;
  is_active: boolean | null;
};

/** An add-on counts only while active and inside its own window. */
export function addonIsLive(addon: CapacityAddonRow, subscriptionEnd?: string | null, now = Date.now()) {
  if (addon.is_active === false) return false;
  if (addon.starts_at && new Date(addon.starts_at).getTime() > now) return false;
  const end = addon.expires_at ?? subscriptionEnd ?? null;
  if (end && new Date(end).getTime() <= now) return false;
  return Number(addon.extra_pcs) > 0;
}

export function liveExtraPcs(addons: CapacityAddonRow[] | undefined, subscriptionEnd?: string | null, now = Date.now()) {
  return (addons ?? [])
    .filter((a) => addonIsLive(a, subscriptionEnd, now))
    .reduce((sum, a) => sum + Number(a.extra_pcs || 0), 0);
}

/** Latest expiry among live add-ons; falls back to the subscription expiry. */
export function extraExpiry(addons: CapacityAddonRow[] | undefined, subscriptionEnd?: string | null, now = Date.now()) {
  const dates = (addons ?? [])
    .filter((a) => addonIsLive(a, subscriptionEnd, now))
    .map((a) => a.expires_at ?? subscriptionEnd)
    .filter((d): d is string => !!d)
    .map((d) => new Date(d).getTime());
  if (!dates.length) return subscriptionEnd ? new Date(subscriptionEnd) : null;
  return new Date(Math.max(...dates));
}

export function capacitySummary(opts: {
  baseCapacity: number;
  addons?: CapacityAddonRow[];
  subscriptionEnd?: string | null;
  usedPcs: number;
  now?: number;
}) {
  const now = opts.now ?? Date.now();
  const base = Math.max(0, Number(opts.baseCapacity || 0));
  const extra = liveExtraPcs(opts.addons, opts.subscriptionEnd, now);
  const total = base + extra;
  const used = Math.max(0, Number(opts.usedPcs || 0));
  return {
    base,
    extra,
    total,
    used,
    available: Math.max(0, total - used),
    usedPercent: total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0,
    extraExpiresAt: extraExpiry(opts.addons, opts.subscriptionEnd, now),
  };
}
