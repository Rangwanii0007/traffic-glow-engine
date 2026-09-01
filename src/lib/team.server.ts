import { createHash } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

/** Untyped service-role client — the team tables live in the software's schema. */
export function getTeamAdmin(): SupabaseClient {
  const url = process.env['EXTERNAL_SUPABASE_URL'] || process.env['SUPABASE_URL'];
  const key = process.env['EXTERNAL_SUPABASE_SERVICE_ROLE_KEY'] || process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) throw new Error("Backend is not configured");
  return createClient(url, key, { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } });
}

export function hashMemberPassword(password: string) {
  return createHash("sha256").update(password).digest("hex");
}

export const WORKER_ROLES = ["team_leader", "editor", "runner", "viewer"] as const;
export type WorkerRole = (typeof WORKER_ROLES)[number];

export const PERMISSION_KEYS = [
  "start_stop_bot", "view_dashboard", "view_sessions", "change_urls", "change_proxy",
  "change_device", "change_traffic", "change_engines", "view_earnings", "view_activity",
  "export_reports", "manage_own_team", "add_members", "remove_members", "create_teams",
  "add_team_leaders", "lock_urls", "lock_proxy", "custom_tabs",
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

const LEADER_PERMS: PermissionKey[] = [
  "start_stop_bot", "view_dashboard", "view_sessions", "change_urls", "change_proxy", "change_device",
  "change_traffic", "change_engines", "view_earnings", "view_activity", "export_reports",
  "manage_own_team", "add_members", "remove_members", "lock_urls", "lock_proxy", "custom_tabs",
];

export function defaultPermissions(role: WorkerRole): Record<PermissionKey, boolean> {
  const perms = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, false])) as Record<PermissionKey, boolean>;
  if (role === "team_leader") {
    for (const k of LEADER_PERMS) perms[k] = true;
    return perms;
  }
  perms.view_dashboard = true;
  perms.view_sessions = true;
  if (role !== "viewer") perms.start_stop_bot = true;
  if (role === "editor") perms.custom_tabs = true;
  return perms;
}

export const permissionSchema = z.record(z.enum(PERMISSION_KEYS), z.boolean());

export const urlEntrySchema = z.object({
  url: z.string().trim().url().max(2000),
  url_type: z.enum(["website", "direct_link", "social_video"]).default("website"),
  count: z.number().int().min(1).max(100000).default(1),
  time_per_page: z.number().int().min(5).max(3600).default(60),
  video_strategy: z.enum(["none", "watch_time", "shorts", "high_rpm"]).default("none"),
  is_active: z.boolean().default(true),
});
export type UrlEntry = z.infer<typeof urlEntrySchema>;

export async function requireSessionUser() {
  const request = getRequest();
  const authHeader = request?.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Not signed in");
  const token = authHeader.slice("Bearer ".length).trim();
  const admin = getTeamAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("Not signed in");
  return { user: data.user, admin };
}

/** Business-plan owners (and site admins) may use the team panel. */
export async function requireBusinessOwner() {
  const { user, admin } = await requireSessionUser();
  const { data: profile } = await admin.from("users").select("role").eq("id", user.id).maybeSingle();
  const isSiteAdmin = (profile as { role?: string } | null)?.role === "admin";
  if (isSiteAdmin) return { user, admin, isSiteAdmin: true };

  const { data: sub } = await admin
    .from("subscriptions")
    .select("status, end_date, plans(slug)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  const planRow = (sub as { plans?: { slug?: string } | { slug?: string }[] } | null)?.plans;
  const slug = Array.isArray(planRow) ? planRow[0]?.slug : planRow?.slug;
  if (slug !== "business") throw new Error("Business plan required");
  return { user, admin, isSiteAdmin: false };
}

/** Ownership check for every team-scoped mutation/read. */
export async function requireTeam(teamId: string) {
  const { user, admin, isSiteAdmin } = await requireBusinessOwner();
  const { data: team, error } = await admin.from("teams").select("*").eq("id", teamId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!team) throw new Error("Team not found");
  if (!isSiteAdmin && (team as { owner_id?: string }).owner_id !== user.id) throw new Error("Not your team");
  return { user, admin, team: team as Record<string, unknown>, isSiteAdmin };
}

export function throwIf(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
