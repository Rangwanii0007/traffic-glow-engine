import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAppAdmin, requireAdmin, requireUser } from "./account.server";
import {
  buildOverview,
  currentUserOverview,
  ensureReferralCode,
  payoutMethodSchema,
  readAffiliateConfig,
  type AffiliateOverview,
} from "./affiliate.server";

/** Everything the affiliate page needs, in one authenticated round-trip. */
export const getAffiliateOverview = createServerFn({ method: "GET" }).handler(
  async (): Promise<AffiliateOverview> => currentUserOverview(),
);

export const savePayoutMethod = createServerFn({ method: "POST" })
  .inputValidator((input) => payoutMethodSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { user, admin } = await requireUser();
    const { count, error: countError } = await admin
      .from("user_payout_methods")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if (countError) throw new Error(countError.message);
    const { error } = await admin.from("user_payout_methods").insert({
      user_id: user.id,
      method_type: data.methodType,
      details: data.details,
      is_default: (count ?? 0) === 0,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removePayoutMethod = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { user, admin } = await requireUser();
    const { error } = await admin
      .from("user_payout_methods")
      .delete()
      .eq("id", data.id)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const requestWithdrawal = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ amount: z.number().positive().max(1000000), methodId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { user, admin } = await requireUser();
    const overview = await buildOverview(user.id, user.email ?? "");
    const method = overview.payoutMethods.find((m) => m.id === data.methodId);
    if (!method) throw new Error("Select a saved payout method first");
    if (!overview.totals.canWithdraw) {
      throw new Error(`You need $${overview.config.minWithdrawal} available before withdrawing`);
    }
    if (data.amount > overview.totals.available) throw new Error("Amount exceeds your available balance");
    if (data.amount < overview.config.minWithdrawal) {
      throw new Error(`Minimum withdrawal is $${overview.config.minWithdrawal}`);
    }
    const { error } = await admin.from("affiliate_withdrawals").insert({
      user_id: user.id,
      amount: data.amount,
      method: method.method_type,
      method_details: method.details,
      status: "pending",
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Links a new signup to a referrer. Accepts a username-style code or a user id. */
export const attachReferral = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        refCode: z.string().trim().min(3).max(64),
        referredId: z.string().uuid(),
        referredEmail: z.string().email(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; reason?: string }> => {
    const admin = getAppAdmin();
    const code = data.refCode.trim();

    let referrerId: string | null = null;
    const { data: byCode } = await admin
      .from("users")
      .select("id")
      .ilike("referral_code", code)
      .maybeSingle();
    if (byCode?.id) referrerId = byCode.id as string;

    if (!referrerId && /^[0-9a-f-]{36}$/i.test(code)) {
      const { data: byId } = await admin.from("users").select("id").eq("id", code).maybeSingle();
      if (byId?.id) referrerId = byId.id as string;
    }
    if (!referrerId) return { ok: false, reason: "referrer_not_found" };
    if (referrerId === data.referredId) return { ok: false, reason: "self_referral" };

    const { data: existing } = await admin
      .from("affiliate_referrals")
      .select("id")
      .eq("referred_id", data.referredId)
      .maybeSingle();
    if (existing?.id) return { ok: true };

    const { error } = await admin.from("affiliate_referrals").insert({
      referrer_id: referrerId,
      referred_id: data.referredId,
      referred_email: data.referredEmail,
      status: "free",
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Validates a referral code while typing on the signup form (optional field). */
export const checkReferralCode = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ code: z.string().trim().min(3).max(64) }).parse(input))
  .handler(async ({ data }): Promise<{ valid: boolean; name?: string }> => {
    const admin = getAppAdmin();
    const { data: row } = await admin
      .from("users")
      .select("full_name, email")
      .ilike("referral_code", data.code.trim())
      .maybeSingle();
    if (!row) return { valid: false };
    const r = row as { full_name: string | null; email: string };
    return { valid: true, name: r.full_name || r.email.split("@")[0] };
  });

/* ------------------------------- ADMIN CONTROLS ------------------------------- */

export type AdminWithdrawal = {
  id: string; user_id: string; amount: number; method: string; method_details: Record<string, string>;
  status: string; admin_notes: string | null; created_at: string; processed_at: string | null;
  user_email: string; user_name: string | null;
};
export type AdminReferral = {
  id: string; referrer_id: string; referred_id: string; status: string; commission_amount: number;
  created_at: string; referrer_email: string; referred_email_resolved: string | null;
};
export type AdminUserRow = { id: string; email: string; full_name: string | null; role: string; referral_code: string | null };

export const adminAffiliateOverview = createServerFn({ method: "GET" }).handler(async (): Promise<{
  config: { minWithdrawal: number; commissionPercent: number; lockPayoutMethods: boolean };
  users: AdminUserRow[];
  withdrawals: AdminWithdrawal[];
  referrals: AdminReferral[];
}> => {
  const { admin } = await requireAdmin();
  const config = await readAffiliateConfig(admin);

  const [{ data: withdrawals }, { data: referrals }, { data: users }] = await Promise.all([
    admin
      .from("affiliate_withdrawals")
      .select("id, user_id, amount, method, method_details, status, admin_notes, created_at, processed_at")
      .order("created_at", { ascending: false })
      .limit(300),
    admin
      .from("affiliate_referrals")
      .select("id, referrer_id, referred_id, referred_email, status, commission_amount, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    admin.from("users").select("id, email, full_name, role, referral_code").order("created_at", { ascending: false }).limit(500),
  ]);

  const userList = (users ?? []) as { id: string; email: string; full_name: string | null; role: string; referral_code: string | null }[];
  const byId = new Map(userList.map((u) => [u.id, u]));

  return {
    config,
    users: userList,
    withdrawals: ((withdrawals ?? []) as Record<string, unknown>[]).map((w) => ({
      ...w,
      amount: Number(w.amount),
      user_email: byId.get(w.user_id as string)?.email ?? "unknown",
      user_name: byId.get(w.user_id as string)?.full_name ?? null,
    })) as AdminWithdrawal[],
    referrals: ((referrals ?? []) as Record<string, unknown>[]).map((r) => ({
      ...r,
      commission_amount: Number(r.commission_amount),
      referrer_email: byId.get(r.referrer_id as string)?.email ?? "unknown",
      referred_email_resolved: byId.get(r.referred_id as string)?.email ?? (r.referred_email as string | null),
    })) as AdminReferral[],
  };
});

export const adminSetAffiliateConfig = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        minWithdrawal: z.number().min(0).max(1000000).optional(),
        commissionPercent: z.number().min(0).max(100).optional(),
        lockPayoutMethods: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { admin } = await requireAdmin();
    const rows: { key: string; value: string }[] = [];
    if (data.minWithdrawal !== undefined) rows.push({ key: "affiliate_min_withdrawal", value: String(data.minWithdrawal) });
    if (data.commissionPercent !== undefined) rows.push({ key: "affiliate_commission_percent", value: String(data.commissionPercent) });
    if (data.lockPayoutMethods !== undefined) rows.push({ key: "affiliate_lock_payout_methods", value: data.lockPayoutMethods ? "true" : "false" });
    for (const row of rows) {
      const { data: existing } = await admin.from("settings").select("id").eq("key", row.key).maybeSingle();
      if (existing?.id) {
        const { error } = await admin.from("settings").update({ value: row.value } as never).eq("key", row.key);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await admin.from("settings").insert({ key: row.key, value: row.value, type: "number" } as never);
        if (error) throw new Error(error.message);
      }
    }
    return { ok: true };
  });

/** Admin manually attaches a referral (referrer -> referred user). */
export const adminAddReferral = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        referrerId: z.string().uuid(),
        referredId: z.string().uuid(),
        markPremium: z.boolean().default(false),
        commission: z.number().min(0).max(100000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { admin } = await requireAdmin();
    if (data.referrerId === data.referredId) throw new Error("A user cannot refer themselves");
    const { data: referred } = await admin.from("users").select("email").eq("id", data.referredId).maybeSingle();
    const { data: existing } = await admin
      .from("affiliate_referrals")
      .select("id")
      .eq("referred_id", data.referredId)
      .maybeSingle();

    const config = await readAffiliateConfig(admin);
    const payload = {
      referrer_id: data.referrerId,
      referred_id: data.referredId,
      referred_email: (referred as { email?: string } | null)?.email ?? null,
      status: data.markPremium ? "premium" : "free",
      commission_amount: data.markPremium ? (data.commission ?? 0) : 0,
      activated_at: data.markPremium ? new Date().toISOString() : null,
    };
    void config;

    if (existing?.id) {
      const { error } = await admin.from("affiliate_referrals").update(payload as never).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await admin.from("affiliate_referrals").insert(payload as never);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/** Admin flips a referral between free and premium (premium pays commission). */
export const adminSetReferralStatus = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["free", "premium"]),
        commission: z.number().min(0).max(100000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { admin } = await requireAdmin();
    const { error } = await admin
      .from("affiliate_referrals")
      .update({
        status: data.status,
        commission_amount: data.status === "premium" ? (data.commission ?? 0) : 0,
        activated_at: data.status === "premium" ? new Date().toISOString() : null,
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminRegenerateReferralCode = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<{ code: string }> => {
    const { admin } = await requireAdmin();
    const { data: row } = await admin.from("users").select("email, full_name").eq("id", data.userId).maybeSingle();
    const u = row as { email?: string; full_name?: string | null } | null;
    await admin.from("users").update({ referral_code: null } as never).eq("id", data.userId);
    const code = await ensureReferralCode(admin, data.userId, u?.email ?? "user@ad4you", u?.full_name ?? null);
    return { code };
  });

/** Admin extends / shortens a user's subscription by N days. */
export const adminAdjustSubscriptionDays = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ userId: z.string().uuid(), days: z.number().int().min(-3650).max(3650) }).parse(input))
  .handler(async ({ data }): Promise<{ ok: true; end_date: string }> => {
    const { admin } = await requireAdmin();
    const { data: sub, error: readError } = await admin
      .from("subscriptions")
      .select("id, end_date, duration_days")
      .eq("user_id", data.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!sub) throw new Error("This user has no subscription yet");
    const current = new Date((sub as { end_date: string }).end_date);
    const base = Number.isFinite(current.getTime()) && current > new Date() ? current : new Date();
    const next = new Date(base.getTime() + data.days * 86400000);
    const { error } = await admin
      .from("subscriptions")
      .update({ end_date: next.toISOString(), status: next > new Date() ? "active" : "expired" } as never)
      .eq("id", (sub as { id: string }).id);
    if (error) throw new Error(error.message);
    return { ok: true, end_date: next.toISOString() };
  });

export const adminProcessWithdrawal = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["release", "reject"]),
        note: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { admin } = await requireAdmin();
    const { data: w, error: readError } = await admin
      .from("affiliate_withdrawals")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!w) throw new Error("Withdrawal not found");
    if ((w as { status: string }).status !== "pending") throw new Error("Only pending requests can be processed");
    const { error } = await admin
      .from("affiliate_withdrawals")
      .update({
        status: data.action === "release" ? "completed" : "rejected",
        processed_at: new Date().toISOString(),
        admin_notes: data.note || (data.action === "release" ? "Successfully sent by admin" : "Rejected by admin"),
      } as never)
      .eq("id", data.id)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
