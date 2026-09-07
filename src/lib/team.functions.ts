import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  defaultPermissions,
  getTeamAdmin,
  hashMemberPassword,
  permissionSchema,
  requireBusinessOwner,
  requireTeam,
  throwIf,
  urlEntrySchema,
  WORKER_ROLES,
  type UrlEntry,
} from "./team.server";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type Row = Record<string, Json>;

const uuid = z.string().uuid();

/* ───────────────────────── access + teams ───────────────────────── */

export const getBusinessAccess = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { isSiteAdmin } = await requireBusinessOwner();
    return { allowed: true as const, isSiteAdmin };
  } catch (error) {
    return { allowed: false as const, isSiteAdmin: false, reason: (error as Error).message };
  }
});

export const listMyTeams = createServerFn({ method: "GET" }).handler(async () => {
  const { user, admin, isSiteAdmin } = await requireBusinessOwner();
  let query = admin.from("teams").select("*").order("created_at", { ascending: true });
  if (!isSiteAdmin) query = query.eq("owner_id", user.id);
  const { data, error } = await query;
  throwIf(error);
  return (data ?? []) as Row[];
});

const teamFields = z.object({
  name: z.string().trim().min(2).max(80),
  company_name: z.string().trim().max(120).optional(),
  description: z.string().trim().max(600).optional(),
  admin_name: z.string().trim().max(120).optional(),
  admin_contact_email: z.string().trim().email().max(160).optional().or(z.literal("")),
  admin_phone: z.string().trim().max(40).optional(),
  admin_whatsapp: z.string().trim().max(40).optional(),
  admin_telegram: z.string().trim().max(60).optional(),
});

export const saveTeam = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ id: uuid.nullable().optional(), values: teamFields }).parse(input))
  .handler(async ({ data }) => {
    if (data.id) {
      const { admin } = await requireTeam(data.id);
      const { error } = await admin.from("teams").update({ ...data.values, updated_at: new Date().toISOString() }).eq("id", data.id);
      throwIf(error);
      return { ok: true as const, id: data.id };
    }
    const { user, admin } = await requireBusinessOwner();
    const { data: created, error } = await admin
      .from("teams")
      .insert({ ...data.values, owner_id: user.id, locked_urls: [], total_members: 0, online_members: 0 })
      .select("id")
      .single();
    throwIf(error);
    const id = (created as { id: string }).id;
    await admin.from("team_configurations").upsert({ team_id: id, urls_list: [] }, { onConflict: "team_id" });
    return { ok: true as const, id };
  });

export const deleteTeam = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data }) => {
    const { admin } = await requireTeam(data.id);
    await admin.from("team_members").delete().eq("team_id", data.id);
    await admin.from("team_configurations").delete().eq("team_id", data.id);
    const { error } = await admin.from("teams").delete().eq("id", data.id);
    throwIf(error);
    return { ok: true as const };
  });

/* ───────────────────────── members ───────────────────────── */

export const listMembers = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ teamId: uuid }).parse(input))
  .handler(async ({ data }) => {
    const { admin } = await requireTeam(data.teamId);
    const { data: rows, error } = await admin
      .from("team_members")
      .select("*")
      .eq("team_id", data.teamId)
      .order("created_at", { ascending: true });
    throwIf(error);
    return (rows ?? []).map((row) => {
      const member = row as Row;
      delete member['password_hash'];
      return member;
    });
  });

export const addMember = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        teamId: uuid,
        name: z.string().trim().min(2).max(80),
        email: z.string().trim().email().max(160),
        password: z.string().min(6).max(72),
        role: z.enum(WORKER_ROLES),
        phone: z.string().trim().max(40).optional(),
        whatsapp: z.string().trim().max(40).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { admin } = await requireTeam(data.teamId);
    const email = data.email.toLowerCase();

    const { data: existing } = await admin.from("team_members").select("id").eq("email", email).maybeSingle();
    if (existing) throw new Error("A member with this email already exists");

    if (data.role === "team_leader") {
      const { data: leader } = await admin
        .from("team_members")
        .select("id")
        .eq("team_id", data.teamId)
        .eq("role", "team_leader")
        .maybeSingle();
      if (leader) throw new Error("This team already has a Team Leader");
    }

    const { data: created, error } = await admin
      .from("team_members")
      .insert({
        team_id: data.teamId,
        name: data.name,
        email,
        password_hash: hashMemberPassword(data.password),
        role: data.role,
        allowed_tools: defaultPermissions(data.role),
        is_active: true,
        is_online: false,
        phone: data.phone ?? null,
        whatsapp: data.whatsapp ?? null,
      })
      .select("id")
      .single();
    throwIf(error);

    if (data.role === "team_leader") {
      await admin.from("teams").update({ team_leader_id: (created as { id: string }).id }).eq("id", data.teamId);
    }
    await syncMemberCount(admin, data.teamId);
    await logActivity(admin, data.teamId, "member_added", `${data.name} (${data.role}) added from web panel`);
    return { ok: true as const };
  });

export const updateMember = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        memberId: uuid,
        teamId: uuid,
        values: z.object({
          name: z.string().trim().min(2).max(80).optional(),
          role: z.enum(WORKER_ROLES).optional(),
          is_active: z.boolean().optional(),
          phone: z.string().trim().max(40).nullable().optional(),
          whatsapp: z.string().trim().max(40).nullable().optional(),
          password: z.string().min(6).max(72).optional(),
          allowed_tools: permissionSchema.optional(),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { admin } = await requireTeam(data.teamId);
    const { password, ...rest } = data.values;
    const patch: Row = { ...rest, updated_at: new Date().toISOString() };
    if (password) patch['password_hash'] = hashMemberPassword(password);

    if (data.values.role === "team_leader") {
      const { data: leader } = await admin
        .from("team_members")
        .select("id")
        .eq("team_id", data.teamId)
        .eq("role", "team_leader")
        .neq("id", data.memberId)
        .maybeSingle();
      if (leader) throw new Error("This team already has a Team Leader");
      await admin.from("teams").update({ team_leader_id: data.memberId }).eq("id", data.teamId);
    }

    const { error } = await admin.from("team_members").update(patch).eq("id", data.memberId).eq("team_id", data.teamId);
    throwIf(error);
    await logActivity(admin, data.teamId, "member_updated", `Member updated from web panel`);
    return { ok: true as const };
  });

export const removeMember = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ memberId: uuid, teamId: uuid }).parse(input))
  .handler(async ({ data }) => {
    const { admin, team } = await requireTeam(data.teamId);
    const { error } = await admin.from("team_members").delete().eq("id", data.memberId).eq("team_id", data.teamId);
    throwIf(error);
    if (team['team_leader_id'] === data.memberId) {
      await admin.from("teams").update({ team_leader_id: null }).eq("id", data.teamId);
    }
    await syncMemberCount(admin, data.teamId);
    await logActivity(admin, data.teamId, "member_removed", "Member removed from web panel");
    return { ok: true as const };
  });

/* ───────────────────────── urls + rules ───────────────────────── */

export const getTeamConfig = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ teamId: uuid }).parse(input))
  .handler(async ({ data }) => {
    const { admin, team } = await requireTeam(data.teamId);
    const { data: config } = await admin.from("team_configurations").select("*").eq("team_id", data.teamId).maybeSingle();
    const urls = ((config as { urls_list?: unknown } | null)?.urls_list ?? []) as UrlEntry[];
    const fallback = Array.isArray(team['locked_urls']) ? (team['locked_urls'] as unknown[]) : [];
    const list: UrlEntry[] = urls.length
      ? urls
      : fallback.map((value) =>
          typeof value === "string"
            ? { url: value, url_type: "website" as const, count: 1, time_per_page: 60, video_strategy: "none" as const, is_active: true }
            : (value as UrlEntry),
        );
    return {
      urls: list,
      traffic_rules: (config as { traffic_rules?: unknown } | null)?.traffic_rules ?? {},
      device_rules: (config as { device_rules?: unknown } | null)?.device_rules ?? {},
      team: team as Row,
    };
  });

export const saveTeamUrls = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ teamId: uuid, urls: z.array(urlEntrySchema).max(500) }).parse(input))
  .handler(async ({ data }) => {
    const { admin } = await requireTeam(data.teamId);
    const now = new Date().toISOString();
    const { error: configError } = await admin
      .from("team_configurations")
      .upsert({ team_id: data.teamId, urls_list: data.urls, updated_at: now }, { onConflict: "team_id" });
    throwIf(configError);
    // Older software builds read the plain string list from teams.locked_urls.
    const { error } = await admin
      .from("teams")
      .update({ locked_urls: data.urls.filter((u) => u.is_active).map((u) => u.url), updated_at: now })
      .eq("id", data.teamId);
    throwIf(error);
    await logActivity(admin, data.teamId, "urls_synced", `${data.urls.length} URL(s) pushed to all members`);
    return { ok: true as const };
  });

export const saveTeamRules = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        teamId: uuid,
        locked_proxies: z.string().trim().max(20000).nullable().optional(),
        locked_traffic_mode: z.string().trim().max(40).nullable().optional(),
        locked_devices: z.array(z.string().trim().max(40)).max(20).optional(),
        daily_limit_per_member: z.number().int().min(0).max(1000000).nullable().optional(),
        allowed_hours: z.object({ start: z.number().int().min(0).max(23), end: z.number().int().min(0).max(23) }).nullable().optional(),
        concurrent_tabs: z.number().int().min(1).max(100000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { teamId, concurrent_tabs, ...rules } = data;
    const { admin, team } = await requireTeam(teamId);
    const settings = { ...((team['settings'] as Row | null) ?? {}) };
    if (concurrent_tabs !== undefined) settings['concurrent_tabs'] = concurrent_tabs;
    const { error } = await admin
      .from("teams")
      .update({ ...rules, settings, updated_at: new Date().toISOString() })
      .eq("id", teamId);
    throwIf(error);
    await logActivity(admin, teamId, "rules_updated", "Team rules updated from web panel");
    return { ok: true as const };
  });

/* ───────────────────────── earnings ───────────────────────── */

const earningsFields = z.object({
  per_visit_rate: z.number().min(0).max(1000),
  per_point_rate: z.number().min(0).max(1000),
  per_ad_view_rate: z.number().min(0).max(1000),
  per_ad_click_rate: z.number().min(0).max(1000),
  bonus_multiplier: z.number().min(0).max(100),
  min_withdrawal: z.number().min(0).max(1000000),
  currency_symbol: z.string().trim().min(1).max(4),
  currency_code: z.string().trim().min(2).max(6),
  admin_notes: z.string().trim().max(600).nullable().optional(),
  visit_enabled: z.boolean(),
  point_enabled: z.boolean(),
  ad_view_enabled: z.boolean(),
  ad_click_enabled: z.boolean(),
});


export const getEarningsConfig = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ teamId: uuid }).parse(input))
  .handler(async ({ data }) => {
    const { admin } = await requireTeam(data.teamId);
    const { data: config } = await admin.from("earnings_config").select("*").eq("team_id", data.teamId).maybeSingle();
    const { data: history } = await admin
      .from("earnings_rate_history")
      .select("*")
      .eq("team_id", data.teamId)
      .order("created_at", { ascending: false })
      .limit(30);
    return { config: (config ?? null) as Row | null, history: (history ?? []) as Row[] };
  });

export const saveEarningsConfig = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ teamId: uuid, values: earningsFields, reason: z.string().trim().max(300).optional() }).parse(input))
  .handler(async ({ data }) => {
    const { admin, user } = await requireTeam(data.teamId);
    const { data: profile } = await admin.from("users").select("full_name, email").eq("id", user.id).maybeSingle();
    const who = (profile as { full_name?: string; email?: string } | null)?.full_name ?? user.email ?? "Owner";
    const { data: previous } = await admin.from("earnings_config").select("*").eq("team_id", data.teamId).maybeSingle();

    const { error } = await admin.from("earnings_config").upsert(
      {
        team_id: data.teamId,
        ...data.values,
        is_active: true,
        updated_by_name: who,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_id" },
    );
    throwIf(error);

    const old = (previous ?? {}) as Record<string, number | undefined>;
    await admin.from("earnings_rate_history").insert({
      team_id: data.teamId,
      old_per_visit_rate: old['per_visit_rate'] ?? null,
      old_per_point_rate: old['per_point_rate'] ?? null,
      old_per_ad_view_rate: old['per_ad_view_rate'] ?? null,
      old_per_ad_click_rate: old['per_ad_click_rate'] ?? null,
      old_bonus_multiplier: old['bonus_multiplier'] ?? null,
      new_per_visit_rate: data.values.per_visit_rate,
      new_per_point_rate: data.values.per_point_rate,
      new_per_ad_view_rate: data.values.per_ad_view_rate,
      new_per_ad_click_rate: data.values.per_ad_click_rate,
      new_bonus_multiplier: data.values.bonus_multiplier,
      changed_by_name: who,
      old_visit_enabled: (old as Record<string, unknown>)['visit_enabled'] ?? null,
      old_point_enabled: (old as Record<string, unknown>)['point_enabled'] ?? null,
      old_ad_view_enabled: (old as Record<string, unknown>)['ad_view_enabled'] ?? null,
      old_ad_click_enabled: (old as Record<string, unknown>)['ad_click_enabled'] ?? null,
      new_visit_enabled: data.values.visit_enabled,
      new_point_enabled: data.values.point_enabled,
      new_ad_view_enabled: data.values.ad_view_enabled,
      new_ad_click_enabled: data.values.ad_click_enabled,
      change_reason: data.reason ?? null,

    });
    await logActivity(admin, data.teamId, "earnings_rates_updated", "Earning rates updated from web panel");
    return { ok: true as const };
  });

/* ───────────────────────── leaderboard + overview ───────────────────────── */

export const getTeamOverview = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ teamId: uuid }).parse(input))
  .handler(async ({ data }) => {
    const { admin } = await requireTeam(data.teamId);
    const [members, pcs, pending, earnings] = await Promise.all([
      admin.from("team_members").select("*").eq("team_id", data.teamId),
      admin.from("team_pcs").select("id, is_online").eq("team_id", data.teamId),
      admin.from("withdrawal_requests").select("id, amount").eq("team_id", data.teamId).eq("status", "pending"),
      admin.from("team_earnings").select("date, visits, earnings, hours, ads_viewed, ads_clicked").eq("team_id", data.teamId).order("date", { ascending: false }).limit(14),
    ]);
    const rows = (members.data ?? []) as Record<string, number | boolean | null>[];
    const sum = (key: string) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
    return {
      members: rows.length,
      online: rows.filter((r) => r['is_online']).length,
      pcs: (pcs.data ?? []).length,
      pcsOnline: ((pcs.data ?? []) as { is_online?: boolean }[]).filter((p) => p.is_online).length,
      visitsToday: sum("visits_today"),
      visitsTotal: sum("visits_total"),
      adsViewedToday: sum("ads_viewed_today"),
      adsClickedToday: sum("ads_clicked_today"),
      hoursToday: sum("hours_today"),
      earningsToday: sum("calculated_earnings_today"),
      earningsTotal: sum("calculated_earnings_total"),
      pendingWithdrawals: (pending.data ?? []).length,
      pendingAmount: ((pending.data ?? []) as { amount?: number }[]).reduce((t, w) => t + Number(w.amount ?? 0), 0),
      daily: ((earnings.data ?? []) as Row[]).reverse(),
    };
  });

export const getLeaderboard = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ teamId: uuid }).parse(input))
  .handler(async ({ data }) => {
    const { admin } = await requireTeam(data.teamId);
    const { data: board, error } = await admin
      .from("team_leaderboard")
      .select("*")
      .eq("team_id", data.teamId)
      .order("current_rank", { ascending: true });
    if (!error && board) return board as Row[];
    // Fall back to raw member rows if the leaderboard view is unavailable.
    const { data: rows } = await admin
      .from("team_members")
      .select("id, name, role, is_online, avatar_url, last_seen, visits_today, visits_total, self_points_today, self_points_total, ads_viewed_today, ads_viewed_total, ads_clicked_today, ads_clicked_total, hours_today, hours_lifetime, calculated_earnings_today, calculated_earnings_total, withdrawal_total, pending_withdrawal")
      .eq("team_id", data.teamId)
      .order("calculated_earnings_total", { ascending: false });
    return (rows ?? []) as Row[];
  });

/* ───────────────────────── withdrawals + company ───────────────────────── */

export const listTeamWithdrawals = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ teamId: uuid }).parse(input))
  .handler(async ({ data }) => {
    const { admin } = await requireTeam(data.teamId);
    const { data: rows, error } = await admin
      .from("withdrawal_requests")
      .select("*")
      .eq("team_id", data.teamId)
      .order("created_at", { ascending: false })
      .limit(200);
    throwIf(error);
    const members = await admin.from("team_members").select("id, name, email").eq("team_id", data.teamId);
    const byId = new Map(((members.data ?? []) as { id: string; name: string; email: string }[]).map((m) => [m.id, m]));
    return ((rows ?? []) as Row[]).map((row) => ({
      ...row,
      member: byId.get(String(row['member_id'])) ?? null,
    }));
  });

export const decideWithdrawal = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        teamId: uuid,
        id: uuid,
        decision: z.enum(["approved", "rejected", "paid"]),
        note: z.string().trim().max(500).optional(),
        transactionId: z.string().trim().max(160).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { admin, user } = await requireTeam(data.teamId);
    const now = new Date().toISOString();
    const patch: Row = {
      status: data.decision,
      admin_notes: data.note ?? null,
      updated_at: now,
    };
    if (data.decision === "approved") { patch['approved_by'] = user.id; patch['approved_at'] = now; }
    if (data.decision === "paid") { patch['paid_at'] = now; patch['transaction_id'] = data.transactionId ?? null; }
    const { error } = await admin.from("withdrawal_requests").update(patch).eq("id", data.id).eq("team_id", data.teamId);
    throwIf(error);
    await logActivity(admin, data.teamId, `withdrawal_${data.decision}`, data.note ?? `Withdrawal ${data.decision}`);
    return { ok: true as const };
  });

export const getCompany = createServerFn({ method: "GET" }).handler(async () => {
  const { user, admin } = await requireBusinessOwner();
  const { data: company } = await admin.from("companies").select("*").eq("owner_id", user.id).maybeSingle();
  if (!company) return { company: null, methods: [] as Row[] };
  const { data: methods } = await admin
    .from("company_payment_methods")
    .select("*")
    .eq("company_id", (company as { id: string }).id)
    .order("created_at", { ascending: true });
  return { company: company as Row, methods: (methods ?? []) as Row[] };
});

export const saveCompany = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        name: z.string().trim().min(2).max(120),
        boss_name: z.string().trim().max(120).optional(),
        email: z.string().trim().email().max(160).optional().or(z.literal("")),
        phone: z.string().trim().max(40).optional(),
        logo_url: z.string().trim().url().max(600).optional().or(z.literal("")),
        min_withdrawal_amount: z.number().min(0).max(1000000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { user, admin } = await requireBusinessOwner();
    const { data: existing } = await admin.from("companies").select("id").eq("owner_id", user.id).maybeSingle();
    if (existing) {
      const { error } = await admin.from("companies").update(data).eq("id", (existing as { id: string }).id);
      throwIf(error);
      return { ok: true as const };
    }
    const { error } = await admin.from("companies").insert({ ...data, owner_id: user.id });
    throwIf(error);
    return { ok: true as const };
  });

export const saveCompanyPaymentMethod = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ name: z.string().trim().min(2).max(80), isActive: z.boolean().default(true) }).parse(input))
  .handler(async ({ data }) => {
    const { user, admin } = await requireBusinessOwner();
    const { data: company } = await admin.from("companies").select("id").eq("owner_id", user.id).maybeSingle();
    if (!company) throw new Error("Save your company profile first");
    const { error } = await admin
      .from("company_payment_methods")
      .insert({ company_id: (company as { id: string }).id, name: data.name, is_active: data.isActive });
    throwIf(error);
    return { ok: true as const };
  });

export const deleteCompanyPaymentMethod = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data }) => {
    const { user, admin } = await requireBusinessOwner();
    const { data: company } = await admin.from("companies").select("id").eq("owner_id", user.id).maybeSingle();
    if (!company) throw new Error("Company not found");
    const { error } = await admin
      .from("company_payment_methods")
      .delete()
      .eq("id", data.id)
      .eq("company_id", (company as { id: string }).id);
    throwIf(error);
    return { ok: true as const };
  });

/* ───────────────────────── activity ───────────────────────── */

export const listTeamActivity = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ teamId: uuid }).parse(input))
  .handler(async ({ data }) => {
    const { admin } = await requireTeam(data.teamId);
    const [logs, sessions, pcs] = await Promise.all([
      admin.from("team_activity_logs").select("*").eq("team_id", data.teamId).order("created_at", { ascending: false }).limit(150),
      admin.from("member_sessions").select("*").eq("team_id", data.teamId).order("login_time", { ascending: false }).limit(80),
      admin.from("team_pcs").select("*").eq("team_id", data.teamId).order("last_heartbeat", { ascending: false }),
    ]);
    return {
      logs: (logs.data ?? []) as Row[],
      sessions: (sessions.data ?? []) as Row[],
      pcs: (pcs.data ?? []) as Row[],
    };
  });

/* ───────────────────────── helpers ───────────────────────── */

type Admin = ReturnType<typeof getTeamAdmin>;

async function syncMemberCount(admin: Admin, teamId: string) {
  const { count } = await admin.from("team_members").select("id", { count: "exact", head: true }).eq("team_id", teamId);
  await admin.from("teams").update({ total_members: count ?? 0, updated_at: new Date().toISOString() }).eq("id", teamId);
}

async function logActivity(admin: Admin, teamId: string, action: string, details: string) {
  try {
    await admin.from("team_activity_logs").insert({ team_id: teamId, action, details, member_name: "Web Panel" });
  } catch { /* activity log is best effort */ }
}
