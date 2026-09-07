import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  createMemberSession,
  getRates,
  hashMemberPassword,
  publicMember,
  requireMemberSession,
  syncAndGetBalance,
  type Row,
} from "./member.server";
import { getTeamAdmin, requireSessionUser } from "./team.server";

const token = z.string().min(16).max(200);

function startOf(kind: "day" | "month" | "week") {
  const now = new Date();
  if (kind === "day") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (kind === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  const day = (now.getDay() + 6) % 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
}

/* ───────────────────────── login ───────────────────────── */

export const memberLogin = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ email: z.string().trim().email().max(160), password: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data }) => {
    const admin = getTeamAdmin();
    const email = data.email.toLowerCase();
    const { data: rows } = await admin.from("team_members").select("*").ilike("email", email).limit(2);
    const member = ((rows ?? []) as Row[])[0];
    if (!member) throw new Error("No team member found with that email");
    if (String(member['password_hash'] ?? "") !== hashMemberPassword(data.password)) {
      throw new Error("Incorrect email or password");
    }
    if (member['is_active'] === false) throw new Error("Your account has been deactivated by your team owner");
    const raw = await createMemberSession(admin, String(member['id']), String(member['team_id']));
    return { token: raw, member: publicMember(member) };
  });

/** A member who also has a real AD4YOU account can continue without retyping a password. */
export const memberLoginWithAccount = createServerFn({ method: "POST" }).handler(async () => {
  const { user, admin } = await requireSessionUser();
  let { data: rows } = await admin.from("team_members").select("*").eq("user_id", user.id).limit(1);
  if (!rows?.length && user.email) {
    const byEmail = await admin.from("team_members").select("*").ilike("email", user.email.toLowerCase()).limit(1);
    rows = byEmail.data ?? [];
    if (rows.length) await admin.from("team_members").update({ user_id: user.id }).eq("id", String((rows[0] as Row)['id']));
  }
  const member = ((rows ?? []) as Row[])[0];
  if (!member) throw new Error("This account is not linked to any team member");
  if (member['is_active'] === false) throw new Error("Your account has been deactivated by your team owner");
  const raw = await createMemberSession(admin, String(member['id']), String(member['team_id']));
  return { token: raw, member: publicMember(member) };
});

export const memberLogout = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token }).parse(input))
  .handler(async ({ data }) => {
    try {
      const { admin, sessionId } = await requireMemberSession(data.token);
      await admin.from("member_web_sessions").delete().eq("id", sessionId);
    } catch { /* already gone */ }
    return { ok: true as const };
  });

/* ───────────────────────── dashboard ───────────────────────── */

export const memberDashboard = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token }).parse(input))
  .handler(async ({ data }) => {
    const { admin, member, team } = await requireMemberSession(data.token);
    const memberId = String(member['id']);
    const balance = await syncAndGetBalance(admin, memberId);
    const rates = await getRates(admin, String(member['team_id']));

    const [entriesRes, withdrawalsRes] = await Promise.all([
      admin.from("member_earning_entries").select("*").eq("member_id", memberId).order("occurred_at", { ascending: false }).limit(500),
      admin.from("member_withdrawals").select("*").eq("member_id", memberId).order("requested_at", { ascending: false }).limit(50),
    ]);
    const entries = (entriesRes.data ?? []) as Row[];
    const withdrawals = (withdrawalsRes.data ?? []) as Row[];

    const since = (from: Date) => entries.filter((e) => new Date(String(e['occurred_at'])).getTime() >= from.getTime());
    const sum = (rows: Row[]) => rows.reduce((t, r) => t + Number(r['amount'] ?? 0), 0);
    const qtyOf = (types: string[]) => entries.filter((e) => types.includes(String(e['entry_type']))).reduce((t, r) => t + Number(r['quantity'] ?? 0), 0);
    const amtOf = (types: string[]) => sum(entries.filter((e) => types.includes(String(e['entry_type']))));
    const byStatus = (status: string) => withdrawals.filter((w) => String(w['status']) === status);

    return {
      member: publicMember(member),
      team: { id: String(team['id']), name: String(team['name'] ?? "My team"), company_name: (team['company_name'] as string | null) ?? null },
      rates,
      balance,
      totalEarnings: sum(entries.filter((e) => Number(e['amount'] ?? 0) > 0)),
      todayEarnings: sum(since(startOf("day"))),
      weekEarnings: sum(since(startOf("week"))),
      monthEarnings: sum(since(startOf("month"))),
      adViews: qtyOf(["ad_view"]),
      adViewEarnings: amtOf(["ad_view"]),
      adClicks: qtyOf(["ad_click"]),
      adClickEarnings: amtOf(["ad_click"]),
      visits: qtyOf(["visit"]),
      visitEarnings: amtOf(["visit"]),
      tasks: qtyOf(["point", "task"]),
      taskEarnings: amtOf(["point", "task"]),
      otherEarnings: amtOf(["bonus", "manual", "adjustment"]),
      pendingAmount: byStatus("pending").concat(byStatus("processing")).reduce((t, w) => t + Number(w['amount'] ?? 0), 0),
      paidAmount: byStatus("successful").reduce((t, w) => t + Number(w['amount'] ?? 0), 0),
      withdrawalCount: withdrawals.length,
      recentActivity: entries.slice(0, 10),
      recentPayments: withdrawals.slice(0, 5),
    };
  });

export const memberEarningHistory = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ token, from: z.string().datetime().optional(), to: z.string().datetime().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { admin, member } = await requireMemberSession(data.token);
    await syncAndGetBalance(admin, String(member['id']));
    let query = admin
      .from("member_earning_entries")
      .select("*")
      .eq("member_id", String(member['id']))
      .order("occurred_at", { ascending: false })
      .limit(1000);
    if (data.from) query = query.gte("occurred_at", data.from);
    if (data.to) query = query.lte("occurred_at", data.to);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const rates = await getRates(admin, String(member['team_id']));
    return { entries: (rows ?? []) as Row[], rates };
  });

export const memberLeaderboard = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token, period: z.enum(["today", "week", "month", "all"]).default("all") }).parse(input))
  .handler(async ({ data }) => {
    const { admin, member, team } = await requireMemberSession(data.token);
    const teamId = String(member['team_id']);
    const { data: members } = await admin.from("team_members").select("id, name, role, is_online, avatar_url").eq("team_id", teamId);
    const list = (members ?? []) as Row[];
    for (const m of list) await admin.rpc("sync_member_bot_earnings", { p_member: String(m['id']) });

    const { data: entries } = await admin
      .from("member_earning_entries")
      .select("member_id, amount, quantity, entry_type, occurred_at")
      .eq("team_id", teamId)
      .limit(20000);
    const all = (entries ?? []) as Row[];
    const cut =
      data.period === "today" ? startOf("day") : data.period === "week" ? startOf("week") : data.period === "month" ? startOf("month") : null;

    const rows = list.map((m) => {
      const mine = all.filter((e) => String(e['member_id']) === String(m['id']));
      const inRange = cut ? mine.filter((e) => new Date(String(e['occurred_at'])).getTime() >= cut.getTime()) : mine;
      const sum = (rs: Row[]) => rs.reduce((t, r) => t + Number(r['amount'] ?? 0), 0);
      const inDay = mine.filter((e) => new Date(String(e['occurred_at'])).getTime() >= startOf("day").getTime());
      const inWeek = mine.filter((e) => new Date(String(e['occurred_at'])).getTime() >= startOf("week").getTime());
      const inMonth = mine.filter((e) => new Date(String(e['occurred_at'])).getTime() >= startOf("month").getTime());
      return {
        id: String(m['id']),
        name: String(m['name'] ?? "Member"),
        role: String(m['role'] ?? "runner"),
        is_online: Boolean(m['is_online']),
        avatar_url: (m['avatar_url'] as string | null) ?? null,
        isMe: String(m['id']) === String(member['id']),
        periodEarnings: sum(inRange),
        todayEarnings: sum(inDay),
        weekEarnings: sum(inWeek),
        monthEarnings: sum(inMonth),
        totalEarnings: sum(mine),
        tasks: inRange.reduce((t, r) => t + Number(r['quantity'] ?? 0), 0),
      };
    });
    rows.sort((a, b) => b.periodEarnings - a.periodEarnings);
    const rates = await getRates(admin, teamId);
    return { rows: rows.map((r, i) => ({ ...r, rank: i + 1 })), rates, teamName: String(team['name'] ?? "My team") };
  });

/* ───────────────────────── withdrawals ───────────────────────── */

export const memberWithdrawMeta = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token }).parse(input))
  .handler(async ({ data }) => {
    const { admin, member } = await requireMemberSession(data.token);
    const balance = await syncAndGetBalance(admin, String(member['id']));
    const rates = await getRates(admin, String(member['team_id']));
    const { data: methods } = await admin
      .from("admin_payout_methods")
      .select("id, name, slug, instructions, fields, min_amount")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    const { data: open } = await admin
      .from("member_withdrawals")
      .select("*")
      .eq("member_id", String(member['id']))
      .in("status", ["pending", "processing"])
      .maybeSingle();
    return { balance, rates, methods: (methods ?? []) as Row[], openRequest: (open ?? null) as Row | null };
  });

export const memberRequestWithdrawal = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        token,
        amount: z.number().positive().max(1000000),
        methodId: z.string().uuid(),
        details: z.record(z.string().max(60), z.string().trim().max(300)),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { admin, member } = await requireMemberSession(data.token);
    // never trust a client balance — the database recomputes and locks
    await syncAndGetBalance(admin, String(member['id']));
    const { data: row, error } = await admin.rpc("request_member_withdrawal", {
      p_member: String(member['id']),
      p_amount: data.amount,
      p_method: data.methodId,
      p_details: data.details,
    });
    if (error) throw new Error(error.message.replace(/^.*?:\s*/, ""));
    return { ok: true as const, withdrawal: row as Row };
  });

export const memberPaymentHistory = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token }).parse(input))
  .handler(async ({ data }) => {
    const { admin, member } = await requireMemberSession(data.token);
    const [wRes, lRes] = await Promise.all([
      admin.from("member_withdrawals").select("*").eq("member_id", String(member['id'])).order("requested_at", { ascending: false }).limit(300),
      admin.from("member_ledger").select("*").eq("member_id", String(member['id'])).order("created_at", { ascending: false }).limit(300),
    ]);
    const rates = await getRates(admin, String(member['team_id']));
    return { withdrawals: (wRes.data ?? []) as Row[], ledger: (lRes.data ?? []) as Row[], rates };
  });

/* ───────────────────────── profile ───────────────────────── */

export const memberProfile = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token }).parse(input))
  .handler(async ({ data }) => {
    const { admin, member, team } = await requireMemberSession(data.token);
    const balance = await syncAndGetBalance(admin, String(member['id']));
    const rates = await getRates(admin, String(member['team_id']));
    const { data: withdrawals } = await admin
      .from("member_withdrawals")
      .select("*")
      .eq("member_id", String(member['id']))
      .order("requested_at", { ascending: false })
      .limit(50);
    const rows = (withdrawals ?? []) as Row[];
    const { data: entries } = await admin
      .from("member_earning_entries")
      .select("amount")
      .eq("member_id", String(member['id']))
      .limit(20000);
    return {
      member: publicMember(member),
      team: { id: String(team['id']), name: String(team['name'] ?? "My team"), company_name: (team['company_name'] as string | null) ?? null },
      balance,
      rates,
      totalEarnings: ((entries ?? []) as Row[]).reduce((t, r) => t + Math.max(0, Number(r['amount'] ?? 0)), 0),
      totalPaid: rows.filter((w) => w['status'] === "successful").reduce((t, w) => t + Number(w['amount'] ?? 0), 0),
      withdrawals: rows,
    };
  });

export const memberUpdateProfile = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        token,
        name: z.string().trim().min(2).max(80).optional(),
        phone: z.string().trim().max(40).optional(),
        whatsapp: z.string().trim().max(40).optional(),
        currentPassword: z.string().max(200).optional(),
        newPassword: z.string().min(6).max(72).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { admin, member } = await requireMemberSession(data.token);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.name) patch['name'] = data.name;
    if (data.phone !== undefined) patch['phone'] = data.phone || null;
    if (data.whatsapp !== undefined) patch['whatsapp'] = data.whatsapp || null;
    if (data.newPassword) {
      if (!data.currentPassword || hashMemberPassword(data.currentPassword) !== String(member['password_hash'] ?? "")) {
        throw new Error("Your current password is incorrect");
      }
      patch['password_hash'] = hashMemberPassword(data.newPassword);
      patch['must_set_password'] = false; // temporary password replaced

    }
    const { error } = await admin.from("team_members").update(patch).eq("id", String(member['id']));
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
