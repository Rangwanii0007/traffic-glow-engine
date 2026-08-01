import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

/** Admin client for the live app database (external project the browser talks to). */
function getAppAdmin() {
  const url = process.env.EXTERNAL_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Backend is not configured");
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

async function requireUser() {
  const request = getRequest();
  const authHeader = request?.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Not signed in");
  const token = authHeader.slice("Bearer ".length).trim();
  const admin = getAppAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("Not signed in");
  return { user: data.user, admin };
}

async function requireAdmin() {
  const { user, admin } = await requireUser();
  const { data } = await admin.from("users").select("role").eq("id", user.id).maybeSingle();
  if ((data as { role?: string } | null)?.role !== "admin") throw new Error("Admin access required");
  return { user, admin };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    if (!referrerId && UUID_RE.test(data.refCode)) {
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

/** Saves a payout method. Tolerates databases where `is_default` does not exist. */
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

    const { count } = await admin
      .from("payment_methods")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    const base = { user_id: user.id, method_type: data.methodType, details: data.details };
    let { error } = await admin
      .from("payment_methods")
      .insert({ ...base, is_default: (count ?? 0) === 0 } as never);

    if (error && /is_default/i.test(error.message)) {
      const retry = await admin.from("payment_methods").insert(base as never);
      error = retry.error;
    }
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePaymentMethod = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { user, admin } = await requireUser();
    const { error } = await admin
      .from("payment_methods")
      .delete()
      .eq("id", data.id)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const planFields = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers or dashes").max(40).optional(),
  description: z.string().trim().max(400).nullable().optional(),
  price: z.number().min(0).max(100000).optional(),
  duration_days: z.number().int().min(0).max(3650).optional(),
  is_free: z.boolean().nullable().optional(),
  is_active: z.boolean().nullable().optional(),
  is_popular: z.boolean().nullable().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
});

export const adminSavePlan = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ id: z.string().uuid().nullable().optional(), values: planFields }).parse(input),
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
