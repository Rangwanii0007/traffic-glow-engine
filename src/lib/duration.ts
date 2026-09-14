export const DURATION_UNITS = ["minutes", "hours", "days", "weeks", "months"] as const;
export type DurationUnit = (typeof DURATION_UNITS)[number];

const MS: Record<DurationUnit, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 604_800_000,
  months: 30 * 86_400_000,
};

export function unitLabel(unit: DurationUnit, value: number) {
  const singular = unit.slice(0, -1);
  return `${value} ${value === 1 ? singular : unit}`;
}

/** Exact expiry preview for the admin UI. The database is the source of truth. */
export function computeExpiry(start: Date, value: number, unit: DurationUnit) {
  if (unit === "months") {
    const d = new Date(start);
    d.setMonth(d.getMonth() + value);
    return d;
  }
  return new Date(start.getTime() + value * MS[unit]);
}

/** Human countdown that adapts to short (minute) and long (day) packages. */
export function formatRemaining(endIso: string | null | undefined, now = Date.now()) {
  if (!endIso) return "—";
  const ms = new Date(endIso).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return "Expired";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days} Days : ${String(hours).padStart(2, "0")} Hours`;
  if (hours > 0) return `${String(hours).padStart(2, "0")} Hours : ${String(minutes).padStart(2, "0")} Minutes`;
  return `${String(minutes).padStart(2, "0")} Minutes : ${String(seconds).padStart(2, "0")} Seconds`;
}
