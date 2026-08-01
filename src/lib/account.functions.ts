import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAppAdmin, planFieldsSchema, referralCodePattern, requireAdmin, requireUser } from "./account.server";

/** Records a referral after signup. Runs with service role so RLS/session state can't block it. */
export const recordReferral = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        refCode: z.string().trim().min(4).max(64),
        referredId: z.string().uuid(),
        referredEmail: z.string().email(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; reason?: string }> => {
    const admin = getAppAdmin();

    let referrerId: string | null = null;
    const { data: byCode } = await admin
      .from("users")
      .select("id")
      .eq("referral_code", data.refCode)
      .maybeSingle();
    if (byCode?.id) referrerId = byCode.id as string;

    if (!referrerId && referralCodePattern.test(data.refCode)) {
      const { data: byId } = await admin.from("users").select("id").eq("id", data.refCode).maybeSingle();
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

export const savePaymentMethod = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        methodType: z.enum(["wire_bank", "bank", "paypal", "payoneer", "crypto"]),
        details: z.record(z.string(), z.string().trim().min(1).max(300)),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { user, admin } = await requireUser();
    const { count, error: countError } = await admin
      .from("user_payout_methods")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if (countError) throw new Error(countError.message);
    const { error } = await admin
      .from("user_payout_methods")
      .insert({ user_id: user.id, method_type: data.methodType, details: data.details, is_default: (count ?? 0) === 0 });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePaymentMethod = createServerFn({ method: "POST" })
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



export const adminSavePlan = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ id: z.string().uuid().nullable().optional(), values: planFieldsSchema }).parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { admin } = await requireAdmin();
    if (data.id) {
      const { error } = await admin.from("plans").update(data.values as never).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      if (!data.values.slug || !data.values.name) throw new Error("Name and slug are required");
      const { error } = await admin.from("plans").insert({
        duration_days: 30,
        price: 0,
        is_active: true,
        sort_order: 99,
        ...data.values,
      } as never);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const adminDeletePlan = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { admin } = await requireAdmin();
    const { error } = await admin.from("plans").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAdminWithdrawals = createServerFn({ method: "GET" })
  .handler(async () => {
    const { admin } = await requireAdmin();
    const { data, error } = await admin
      .from("affiliate_withdrawals")
      .select("id, user_id, amount, method, method_details, status, admin_notes, created_at, processed_at, users(email, full_name)")
      .order("created_at", { ascending: false })
      .limit(250);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const releaseWithdrawal = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ id: z.string().uuid(), note: z.string().trim().max(500).optional() }).parse(input))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { admin } = await requireAdmin();
    const { data: withdrawal, error: readError } = await admin
      .from("affiliate_withdrawals")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!withdrawal) throw new Error("Withdrawal not found");
    if (withdrawal.status !== "pending") throw new Error("Only pending withdrawals can be released");
    const { error } = await admin
      .from("affiliate_withdrawals")
      .update({ status: "completed", processed_at: new Date().toISOString(), admin_notes: data.note || "Released by admin" })
      .eq("id", data.id)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
