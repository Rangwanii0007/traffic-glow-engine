import { createHash, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTeamAdmin, hashMemberPassword } from "./team.server";

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type Row = Record<string, Json>;

export function newSessionToken() {
  const raw = randomBytes(32).toString("hex");
  return { raw, hash: createHash("sha256").update(raw).digest("hex") };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export { hashMemberPassword };

const PUBLIC_MEMBER_FIELDS = [
  "id", "team_id", "name", "email", "role", "is_active", "is_online", "avatar_url", "phone", "whatsapp",
  "allowed_tools", "created_at", "last_seen", "last_web_login", "user_id",
  "visits_today", "visits_total", "self_points_today", "self_points_total",
  "ads_viewed_today", "ads_viewed_total", "ads_clicked_today", "ads_clicked_total",
  "hours_today", "hours_lifetime", "must_set_password",
];

export function publicMember(member: Row): Row {
  const out: Row = {};
  for (const key of PUBLIC_MEMBER_FIELDS) if (key in member) out[key] = member[key];
  return out;
}

/** Resolve a team-member web session token into the member + their team. */
export async function requireMemberSession(token: string) {
  if (!token || token.length < 16) throw new Error("Please sign in again");
  const admin = getTeamAdmin();
  const { data: session } = await admin
    .from("member_web_sessions")
    .select("*")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!session) throw new Error("Please sign in again");
  const row = session as Row;
  if (new Date(String(row['expires_at'])).getTime() < Date.now()) {
    await admin.from("member_web_sessions").delete().eq("id", String(row['id']));
    throw new Error("Your session expired — please sign in again");
  }

  const { data: member } = await admin.from("team_members").select("*").eq("id", String(row['member_id'])).maybeSingle();
  if (!member) throw new Error("Your team account no longer exists");
  const m = member as Row;
  if (m['is_active'] === false) throw new Error("Your account has been deactivated by your team owner");

  const { data: team } = await admin.from("teams").select("*").eq("id", String(m['team_id'])).maybeSingle();
  if (!team) throw new Error("Your team no longer exists");

  void admin.from("member_web_sessions").update({ last_seen: new Date().toISOString() }).eq("id", String(row['id']));

  return { admin, member: m, team: team as Row, sessionId: String(row['id']) };
}

export async function createMemberSession(admin: SupabaseClient, memberId: string, teamId: string, agent?: string) {
  const { raw, hash } = newSessionToken();
  const { error } = await admin.from("member_web_sessions").insert({
    member_id: memberId,
    team_id: teamId,
    token_hash: hash,
    user_agent: agent ?? null,
  });
  if (error) throw new Error(error.message);
  await admin.from("team_members").update({ last_web_login: new Date().toISOString() }).eq("id", memberId);
  return raw;
}

export type EarningsRates = {
  per_visit_rate: number;
  per_point_rate: number;
  per_ad_view_rate: number;
  per_ad_click_rate: number;
  bonus_multiplier: number;
  min_withdrawal: number;
  currency_symbol: string;
  currency_code: string;
  admin_notes: string | null;
  visit_enabled: boolean;
  point_enabled: boolean;
  ad_view_enabled: boolean;
  ad_click_enabled: boolean;
};

export const RATE_DEFAULTS: EarningsRates = {
  per_visit_rate: 0, per_point_rate: 0, per_ad_view_rate: 0, per_ad_click_rate: 0,
  bonus_multiplier: 1, min_withdrawal: 0, currency_symbol: "$", currency_code: "USD", admin_notes: null,
  visit_enabled: true, point_enabled: true, ad_view_enabled: true, ad_click_enabled: true,
};

/** Platform seed rates — used only when a team has no earnings_config row yet. */
const SEED_CONFIG = {
  per_visit_rate: 0.002,
  per_point_rate: 0.00003,
  per_ad_view_rate: 0.0005,
  per_ad_click_rate: 0.01,
  bonus_multiplier: 1,
  min_withdrawal: 5,
  currency_symbol: "$",
  currency_code: "USD",
  is_active: true,
  visit_enabled: true,
  point_enabled: true,
  ad_view_enabled: true,
  ad_click_enabled: true,
};

/**
 * Rates for ONE team. A team whose owner never opened the earnings page has no
 * config row at all — that was silently zeroing every member's earnings, so we
 * create the row once with the platform seed instead of guessing per request.
 */
export async function getRates(admin: SupabaseClient, teamId: string): Promise<EarningsRates> {
  let { data } = await admin.from("earnings_config").select("*").eq("team_id", teamId).maybeSingle();
  if (!data) {
    await admin.from("earnings_config").insert({ team_id: teamId, ...SEED_CONFIG });
    const retry = await admin.from("earnings_config").select("*").eq("team_id", teamId).maybeSingle();
    data = retry.data;
  }
  const c = (data ?? SEED_CONFIG) as Record<string, unknown>;
  const flag = (key: string) => c[key] !== false;
  return {
    per_visit_rate: Number(c['per_visit_rate'] ?? 0),
    per_point_rate: Number(c['per_point_rate'] ?? 0),
    per_ad_view_rate: Number(c['per_ad_view_rate'] ?? 0),
    per_ad_click_rate: Number(c['per_ad_click_rate'] ?? 0),
    bonus_multiplier: Number(c['bonus_multiplier'] ?? 1),
    min_withdrawal: Number(c['min_withdrawal'] ?? 0),
    currency_symbol: String(c['currency_symbol'] ?? "$"),
    currency_code: String(c['currency_code'] ?? "USD"),
    admin_notes: (c['admin_notes'] as string | null) ?? null,
    visit_enabled: flag("visit_enabled"),
    point_enabled: flag("point_enabled"),
    ad_view_enabled: flag("ad_view_enabled"),
    ad_click_enabled: flag("ad_click_enabled"),
  };
}


/* ─────────────── ONE activity source: the team_members counters ───────────────
   The desktop software writes its activity onto the team_members row. The owner
   panel/leaderboard reads those columns, so every member-facing screen reads the
   exact same columns instead of a second, web-only history.                    */

export type MemberActivity = {
  visitsToday: number; visitsTotal: number;
  adsViewedToday: number; adsViewedTotal: number;
  adsClickedToday: number; adsClickedTotal: number;
  pointsToday: number; pointsTotal: number;
  hoursToday: number; hoursTotal: number;
  successfulVisitsToday: number; failedVisitsToday: number;
  isOnline: boolean; lastSeen: string | null;
};

const num = (row: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null) return Number(row[key]) || 0;
  return 0;
};

export function memberActivity(row: Record<string, unknown>): MemberActivity {
  return {
    visitsToday: num(row, "visits_today"),
    visitsTotal: num(row, "visits_total", "display_visits_total"),
    adsViewedToday: num(row, "ads_viewed_today"),
    adsViewedTotal: num(row, "ads_viewed_total"),
    adsClickedToday: num(row, "ads_clicked_today"),
    adsClickedTotal: num(row, "ads_clicked_total"),
    pointsToday: num(row, "self_points_today"),
    pointsTotal: num(row, "self_points_total", "display_points_total"),
    hoursToday: num(row, "hours_today"),
    hoursTotal: num(row, "hours_lifetime", "hours_total"),
    successfulVisitsToday: num(row, "successful_visits_today"),
    failedVisitsToday: num(row, "failed_visits_today"),
    isOnline: Boolean(row['is_online']),
    lastSeen: (row['last_seen'] as string | null) ?? null,
  };
}

const BOT_KINDS: { kind: string; counter: string; rate: keyof EarningsRates; toggle: keyof EarningsRates }[] = [
  { kind: "visit", counter: "visits_total", rate: "per_visit_rate", toggle: "visit_enabled" },
  { kind: "point", counter: "self_points_total", rate: "per_point_rate", toggle: "point_enabled" },
  { kind: "ad_view", counter: "ads_viewed_total", rate: "per_ad_view_rate", toggle: "ad_view_enabled" },
  { kind: "ad_click", counter: "ads_clicked_total", rate: "per_ad_click_rate", toggle: "ad_click_enabled" },
];

/**
 * Turns new software activity into money using THIS team's rates and feature
 * switches. Only the not-yet-credited difference is written, so refreshing or a
 * realtime burst can never pay twice. When the owner has a feature switched off
 * the activity is still marked as counted at zero, so switching it back on never
 * back-pays the disabled period.
 */
export async function syncMemberEarnings(admin: SupabaseClient, memberRow: Record<string, unknown>, rates: EarningsRates) {
  const memberId = String(memberRow['id']);
  const teamId = String(memberRow['team_id']);
  const ownerId = (memberRow['owner_id'] as string | null) ?? null;
  const { data: credited } = await admin
    .from("member_earning_entries")
    .select("entry_type, quantity")
    .eq("member_id", memberId)
    .eq("source", "bot")
    .limit(20000);

  const done = new Map<string, number>();
  for (const row of (credited ?? []) as Row[]) {
    const key = String(row['entry_type']);
    done.set(key, (done.get(key) ?? 0) + Number(row['quantity'] ?? 0));
  }

  for (const item of BOT_KINDS) {
    const counter = Number(memberRow[item.counter] ?? 0) || 0;
    const delta = counter - (done.get(item.kind) ?? 0);
    if (delta <= 0) continue;
    const enabled = rates[item.toggle] !== false;
    const rate = enabled ? Number(rates[item.rate] ?? 0) * Number(rates.bonus_multiplier ?? 1) : 0;
    const amount = Math.round(delta * rate * 10000) / 10000;
    const { error } = await admin.from("member_earning_entries").insert({
      team_id: teamId,
      owner_id: ownerId,
      member_id: memberId,
      entry_type: item.kind,
      quantity: delta,
      rate,
      amount,
      source: "bot",
      note: enabled ? "Auto-credited from software activity" : "Earning feature switched off by team owner",
    });
    if (error) throw new Error(error.message);
    if (amount !== 0) {
      await admin.from("member_ledger").insert({
        team_id: teamId,
        owner_id: ownerId,
        member_id: memberId,
        kind: "earning",
        amount,
        reference_type: "bot_sync",
        note: `${item.kind} x ${delta}`,
      });
    }
  }
}

/** Credits any new bot activity, then returns the trusted ledger balance. */
export async function syncAndGetBalance(admin: SupabaseClient, memberId: string, memberRow?: Record<string, unknown>) {
  let row = memberRow;
  if (!row) {
    const { data } = await admin.from("team_members").select("*").eq("id", memberId).maybeSingle();
    row = (data ?? undefined) as Record<string, unknown> | undefined;
  }
  if (row) {
    const rates = await getRates(admin, String(row['team_id']));
    await syncMemberEarnings(admin, row, rates);
  }
  const { data, error } = await admin.rpc("member_balance", { p_member: memberId });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}
