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
  "hours_today", "hours_lifetime",
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

export async function getRates(admin: SupabaseClient, teamId: string): Promise<EarningsRates> {
  const { data } = await admin.from("earnings_config").select("*").eq("team_id", teamId).maybeSingle();
  const c = (data ?? {}) as Record<string, unknown>;
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


/** Credits any new bot activity, then returns the trusted ledger balance. */
export async function syncAndGetBalance(admin: SupabaseClient, memberId: string) {
  await admin.rpc("sync_member_bot_earnings", { p_member: memberId });
  const { data, error } = await admin.rpc("member_balance", { p_member: memberId });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}
