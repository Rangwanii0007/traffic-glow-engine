import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireTeam, throwIf } from "./team.server";
import { getRates, hashMemberPassword, memberActivity, syncMemberEarnings, type Row } from "./member.server";

const uuid = z.string().uuid();

export type MemberEarningRow = Row & {
  balance: number; totalEarnings: number; monthEarnings: number; tasks: number;
  pending: number; paid: number; withdrawals: number; hasAccount: boolean;
};
export type MemberWithdrawalRow = Row & { member: Row | null };

/* ───────── owner view of every member's money ───────── */

export const listTeamMemberEarnings = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ teamId: uuid }).parse(input))
  .handler(async ({ data }) => {
    const { admin } = await requireTeam(data.teamId);
    const { data: members } = await admin
      .from("team_members")
      .select("*")
      .eq("team_id", data.teamId)
      .order("created_at", { ascending: true });
    const list = (members ?? []) as Row[];
    const teamRates = await getRates(admin, data.teamId);

    const [entriesRes, withdrawalsRes] = await Promise.all([
      (async () => {
        for (const m of list) await syncMemberEarnings(admin, m, teamRates);
        return admin.from("member_earning_entries").select("member_id, amount, quantity, entry_type, occurred_at").eq("team_id", data.teamId).limit(20000);
      })(),
      admin.from("member_withdrawals").select("member_id, amount, status").eq("team_id", data.teamId).limit(5000),
    ]);
    const entries = (entriesRes.data ?? []) as Row[];
    const withdrawals = (withdrawalsRes.data ?? []) as Row[];

    const balances = new Map<string, number>();
    for (const m of list) {
      const { data: bal } = await admin.rpc("member_balance", { p_member: String(m['id']) });
      balances.set(String(m['id']), Number(bal ?? 0));
    }

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const rows: MemberEarningRow[] = list.map((m) => {
      const id = String(m['id']);
      const mine = entries.filter((e) => String(e['member_id']) === id);
      const w = withdrawals.filter((x) => String(x['member_id']) === id);
      const sum = (rs: Row[]) => rs.reduce((t, r) => t + Number(r['amount'] ?? 0), 0);
      return {
        ...m,
        balance: balances.get(id) ?? 0,
        totalEarnings: sum(mine.filter((e) => Number(e['amount'] ?? 0) > 0)),
        monthEarnings: sum(mine.filter((e) => new Date(String(e['occurred_at'])).getTime() >= monthStart)),
        tasks: mine.reduce((t, r) => t + Number(r['quantity'] ?? 0), 0),
        pending: sum(w.filter((x) => x['status'] === "pending" || x['status'] === "processing")),
        paid: sum(w.filter((x) => x['status'] === "successful")),
        withdrawals: w.length,
        hasAccount: Boolean(m['user_id']),
      };
    });

    const rates = await getRates(admin, data.teamId);
    return {
      rows,
      rates,
      totals: {
        members: rows.length,
        active: rows.filter((r) => r['is_active'] !== false).length,
        earnings: rows.reduce((t, r) => t + r.totalEarnings, 0),
        month: rows.reduce((t, r) => t + r.monthEarnings, 0),
        pending: rows.reduce((t, r) => t + r.pending, 0),
        paid: rows.reduce((t, r) => t + r.paid, 0),
        balance: rows.reduce((t, r) => t + r.balance, 0),
      },
    };
  });

export const creditMember = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        teamId: uuid,
        memberId: uuid,
        entryType: z.enum(["ad_view", "ad_click", "visit", "task", "bonus", "manual", "adjustment"]),
        quantity: z.number().min(0).max(10000000).default(0),
        amount: z.number().min(-1000000).max(1000000),
        note: z.string().trim().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { admin } = await requireTeam(data.teamId);
    const { data: member } = await admin.from("team_members").select("id").eq("id", data.memberId).eq("team_id", data.teamId).maybeSingle();
    if (!member) throw new Error("Member not found in this team");
    const { error } = await admin.rpc("credit_member_manual", {
      p_member: data.memberId,
      p_entry_type: data.entryType,
      p_quantity: data.quantity,
      p_amount: data.amount,
      p_note: data.note ?? "Manual entry by team owner",
    });
    throwIf(error);
    return { ok: true as const };
  });

/* ───────── member withdrawals (owner side) ───────── */

export const listMemberWithdrawals = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ teamId: uuid }).parse(input))
  .handler(async ({ data }) => {
    const { admin } = await requireTeam(data.teamId);
    const { data: rows, error } = await admin
      .from("member_withdrawals")
      .select("*")
      .eq("team_id", data.teamId)
      .order("requested_at", { ascending: false })
      .limit(300);
    throwIf(error);
    const { data: members } = await admin.from("team_members").select("id, name, email").eq("team_id", data.teamId);
    const byId = new Map(((members ?? []) as Row[]).map((m) => [String(m['id']), m]));
    const rates = await getRates(admin, data.teamId);
    return {
      rows: ((rows ?? []) as Row[]).map((r) => ({ ...r, member: byId.get(String(r['member_id'])) ?? null })) as MemberWithdrawalRow[],
      rates,
    };
  });

export const decideMemberWithdrawal = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        teamId: uuid,
        id: uuid,
        decision: z.enum(["processing", "successful", "rejected"]),
        reason: z.string().trim().max(400).optional(),
        transactionId: z.string().trim().max(160).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { admin, user } = await requireTeam(data.teamId);
    if (data.decision === "rejected" && !data.reason) throw new Error("Please enter a rejection reason");
    const { data: row } = await admin.from("member_withdrawals").select("id").eq("id", data.id).eq("team_id", data.teamId).maybeSingle();
    if (!row) throw new Error("Withdrawal not found in this team");
    const { error } = await admin.rpc("decide_member_withdrawal", {
      p_id: data.id,
      p_decision: data.decision,
      p_reason: data.reason ?? null,
      p_transaction_id: data.transactionId ?? null,
      p_actor: user.id,
    });
    if (error) throw new Error(error.message.replace(/^.*?:\s*/, ""));
    return { ok: true as const };
  });

/* ───────── optional real login account for a member ───────── */

export const createMemberLoginAccount = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ teamId: uuid, memberId: uuid, password: z.string().min(8).max(72) }).parse(input))
  .handler(async ({ data }) => {
    const { admin } = await requireTeam(data.teamId);
    const { data: member } = await admin
      .from("team_members")
      .select("id, email, name, user_id")
      .eq("id", data.memberId)
      .eq("team_id", data.teamId)
      .maybeSingle();
    if (!member) throw new Error("Member not found in this team");
    const m = member as Row;
    if (m['user_id']) throw new Error("This member already has a login account");

    const { data: created, error } = await admin.auth.admin.createUser({
      email: String(m['email']),
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: String(m['name'] ?? ""), team_member: true },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Could not create the account");

    await admin.from("team_members").update({
      user_id: created.user.id,
      password_hash: hashMemberPassword(data.password),
      updated_at: new Date().toISOString(),
    }).eq("id", data.memberId);
    return { ok: true as const };
  });
