export function money(amount: unknown, symbol = "$") {
  const value = Number(amount ?? 0) || 0;
  return `${symbol}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function qty(value: unknown) {
  return (Number(value ?? 0) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export const ENTRY_LABELS: Record<string, string> = {
  visit: "Website visits",
  point: "Tasks / points",
  task: "Tasks",
  ad_view: "Ad views",
  ad_click: "Ad clicks",
  bonus: "Bonus",
  manual: "Manual credit",
  adjustment: "Adjustment",
};

export const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  processing: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  successful: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  rejected: "bg-red-500/15 text-red-300 ring-red-500/30",
};
