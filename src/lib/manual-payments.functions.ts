import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSessionUser } from "./team.server";
import { getUsdRate, resolvePackage } from "./manual-payments.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = Record<string, any>;
const t = (admin: unknown, table: string) => (admin as { from: (n: string) => any }).from(table);

async function requireSiteAdmin() {
  const { user, admin } = await requireSessionUser();
  const { data } = await admin.from("users").select("role").eq("id", user.id).maybeSingle();
  if ((data as { role?: string } | null)?.role !== "admin") throw new Error("Admins only");
  return { user, admin };
}

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp" };
const imageSchema = z.object({
  type: z.string().refine((v) => v in IMAGE_TYPES, "Only JPG, JPEG, PNG or WebP images are allowed"),
  base64: z.string().min(10).max(7_500_000, "Image must be under 5 MB"),
});

/* ───────── user: checkout data ───────── */

export const getManualCheckout = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ planId: z.string().uuid(), optionId: z.string().uuid().nullable().optional() }).parse(i))
  .handler(async ({ data }) => {
    const { admin } = await requireSessionUser();
    const pkg = await resolvePackage(admin, data.planId, data.optionId ?? null);
    const [{ data: countries }, { data: methods }, { data: links }] = await Promise.all([
      t(admin, "payment_countries").select("*").eq("is_active", true).order("sort_order"),
      t(admin, "manual_payment_methods").select("*").eq("is_active", true).eq("is_archived", false).order("sort_order"),
      t(admin, "manual_payment_method_countries").select("method_id, country_id"),
    ]);
    return {
      pkg,
      countries: (countries ?? []) as Any[],
      methods: (methods ?? []) as Any[],
      links: (links ?? []) as { method_id: string; country_id: string }[],
    };
  });

export const getManualQuote = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ planId: z.string().uuid(), optionId: z.string().uuid().nullable().optional(), methodId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { admin } = await requireSessionUser();
    const pkg = await resolvePackage(admin, data.planId, data.optionId ?? null);
    const { data: method } = await t(admin, "manual_payment_methods").select("currency_code, is_active, is_archived").eq("id", data.methodId).maybeSingle();
    if (!method || !method.is_active || method.is_archived) throw new Error("This payment method is not available");
    const rate = await getUsdRate(String(method.currency_code));
    return { ...rate, basePrice: pkg.price, localAmount: Math.round(pkg.price * rate.rate * 100) / 100 };
  });

export const submitManualPayment = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({
      planId: z.string().uuid(),
      optionId: z.string().uuid().nullable().optional(),
      methodId: z.string().uuid(),
      countryId: z.string().uuid(),
      transactionId: z.string().trim().min(3, "Enter the transaction ID").max(160),
      screenshot: imageSchema,
    }).parse(i),
  )
  .handler(async ({ data }) => {
    const { user, admin } = await requireSessionUser();
    const pkg = await resolvePackage(admin, data.planId, data.optionId ?? null);

    const { data: country } = await t(admin, "payment_countries").select("*").eq("id", data.countryId).maybeSingle();
    if (!country || !country.is_active) throw new Error("This country is not available");
    const { data: method } = await t(admin, "manual_payment_methods").select("*").eq("id", data.methodId).maybeSingle();
    if (!method || !method.is_active || method.is_archived) throw new Error("This payment method is not available");
    const { data: link } = await t(admin, "manual_payment_method_countries").select("method_id").eq("method_id", data.methodId).eq("country_id", data.countryId).maybeSingle();
    if (!link) throw new Error("This payment method is not offered in the selected country");

    const txn = data.transactionId.trim();
    const { data: dupe } = await t(admin, "manual_payments").select("id").ilike("transaction_id", txn.replace(/[%_\\]/g, "\\$&")).limit(1);
    if ((dupe ?? []).length) throw new Error("This transaction ID has already been submitted");
    let pendingQ = t(admin, "manual_payments").select("id").eq("user_id", user.id).eq("plan_id", pkg.planId).eq("status", "pending");
    pendingQ = pkg.optionId ? pendingQ.eq("pricing_option_id", pkg.optionId) : pendingQ.is("pricing_option_id", null);
    const { data: pending } = await pendingQ.limit(1);
    if ((pending ?? []).length) throw new Error("You already have a pending payment for this package. Please wait for review.");

    // Rate and amount are calculated on the server and frozen into the record.
    const rate = await getUsdRate(String(method.currency_code));
    const localAmount = Math.round(pkg.price * rate.rate * 100) / 100;

    const bytes = Buffer.from(data.screenshot.base64.replace(/^data:[^,]+,/, ""), "base64");
    if (bytes.length > 5 * 1024 * 1024) throw new Error("Image must be under 5 MB");
    const path = `${user.id}/${crypto.randomUUID()}.${IMAGE_TYPES[data.screenshot.type]}`;
    const up = await admin.storage.from("payment-proofs").upload(path, bytes, { contentType: data.screenshot.type, upsert: false });
    if (up.error) throw new Error(`Could not upload screenshot: ${up.error.message}`);

    const { data: row, error } = await t(admin, "manual_payments").insert({
      user_id: user.id,
      plan_id: pkg.planId,
      pricing_option_id: pkg.optionId,
      plan_name: pkg.planName,
      package_label: pkg.label,
      duration_days: pkg.days,
      base_price_usd: pkg.price,
      method_id: method.id,
      method_name: method.name,
      country_id: country.id,
      country_name: country.name,
      country_code: country.code,
      currency_code: method.currency_code,
      exchange_rate: rate.rate,
      local_amount: localAmount,
      rate_source: rate.source,
      rate_fetched_at: rate.fetchedAt,
      transaction_id: txn,
      screenshot_path: path,
    }).select("id").single();
    if (error) {
      await admin.storage.from("payment-proofs").remove([path]);
      if (error.code === "23505") throw new Error(/txn/.test(error.message) ? "This transaction ID has already been submitted" : "You already have a pending payment for this package");
      throw new Error(error.message);
    }
    return { id: String(row.id) };
  });

export const listMyManualPayments = createServerFn({ method: "GET" }).handler(async () => {
  const { user, admin } = await requireSessionUser();
  const { data, error } = await t(admin, "manual_payments")
    .select("id, package_label, method_name, country_name, currency_code, local_amount, base_price_usd, exchange_rate, transaction_id, status, rejection_reason, created_at, approved_at")
    .eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as Any[];
});

/* ───────── admin: countries ───────── */

export const listPaymentSetupAdmin = createServerFn({ method: "GET" }).handler(async () => {
  const { admin } = await requireSiteAdmin();
  const [c, m, l] = await Promise.all([
    t(admin, "payment_countries").select("*").order("sort_order"),
    t(admin, "manual_payment_methods").select("*").order("sort_order"),
    t(admin, "manual_payment_method_countries").select("method_id, country_id"),
  ]);
  if (c.error) throw new Error(c.error.message);
  if (m.error) throw new Error(m.error.message);
  return { countries: (c.data ?? []) as Any[], methods: (m.data ?? []) as Any[], links: (l.data ?? []) as { method_id: string; country_id: string }[] };
});

export const saveCountry = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({
    id: z.string().uuid().nullable().optional(),
    name: z.string().trim().min(2).max(80),
    code: z.string().trim().min(2).max(6).transform((v) => v.toUpperCase()),
    flag: z.string().trim().max(16).optional(),
    logo_url: z.string().trim().url().max(500).optional().or(z.literal("")),
    currency_code: z.string().trim().length(3).transform((v) => v.toUpperCase()),
    currency_symbol: z.string().trim().min(1).max(8),
    is_active: z.boolean(),
    sort_order: z.number().int().min(0).max(999),
  }).parse(i))
  .handler(async ({ data }) => {
    const { admin } = await requireSiteAdmin();
    const { id, ...v } = data;
    const patch = { ...v, flag: v.flag || null, logo_url: v.logo_url || null };
    const { error } = id ? await t(admin, "payment_countries").update(patch).eq("id", id) : await t(admin, "payment_countries").insert(patch);
    if (error) throw new Error(error.code === "23505" ? "A country with this code already exists" : error.message);
    return { ok: true as const };
  });

export const deleteCountry = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { admin } = await requireSiteAdmin();
    const { error } = await t(admin, "payment_countries").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/* ───────── admin: methods ───────── */

const opt = z.string().trim().max(400).optional();
export const saveManualMethod = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({
    id: z.string().uuid().nullable().optional(),
    name: z.string().trim().min(2).max(80),
    category: z.enum(["local", "bank", "wallet", "paypal", "payoneer", "binance", "crypto", "other"]),
    logo_url: z.string().trim().max(500).optional(),
    currency_code: z.string().trim().length(3).transform((v) => v.toUpperCase()),
    account_name: opt, bank_name: opt, account_number: opt, iban: opt, branch: opt,
    paypal_email: opt, payoneer_account: opt, binance_uid: opt, crypto_coin: opt,
    crypto_network: opt, wallet_address: opt, reference_info: opt,
    instructions: z.string().trim().max(2000).optional(),
    is_active: z.boolean(),
    sort_order: z.number().int().min(0).max(999),
    countryIds: z.array(z.string().uuid()).min(1, "Assign at least one country"),
  }).parse(i))
  .handler(async ({ data }) => {
    const { admin } = await requireSiteAdmin();
    const { id, countryIds, ...v } = data;
    const patch: Any = { ...v };
    for (const k of Object.keys(patch)) if (patch[k] === "") patch[k] = null;
    let methodId = id ?? null;
    if (methodId) {
      const { error } = await t(admin, "manual_payment_methods").update(patch).eq("id", methodId);
      if (error) throw new Error(error.message);
    } else {
      const { data: row, error } = await t(admin, "manual_payment_methods").insert(patch).select("id").single();
      if (error) throw new Error(error.message);
      methodId = String(row.id);
    }
    await t(admin, "manual_payment_method_countries").delete().eq("method_id", methodId);
    const { error: le } = await t(admin, "manual_payment_method_countries").insert(countryIds.map((c) => ({ method_id: methodId, country_id: c })));
    if (le) throw new Error(le.message);
    return { ok: true as const };
  });

export const toggleManualMethod = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ id: z.string().uuid(), is_active: z.boolean().optional(), is_archived: z.boolean().optional(), sort_order: z.number().int().min(0).max(999).optional() }).parse(i))
  .handler(async ({ data }) => {
    const { admin } = await requireSiteAdmin();
    const { id, ...patch } = data;
    if (patch.is_archived) patch.is_active = false;
    const { error } = await t(admin, "manual_payment_methods").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const uploadMethodLogo = createServerFn({ method: "POST" })
  .inputValidator((i) => imageSchema.parse(i))
  .handler(async ({ data }) => {
    const { admin } = await requireSiteAdmin();
    const bytes = Buffer.from(data.base64.replace(/^data:[^,]+,/, ""), "base64");
    if (bytes.length > 2 * 1024 * 1024) throw new Error("Logo must be under 2 MB");
    const path = `methods/${crypto.randomUUID()}.${IMAGE_TYPES[data.type]}`;
    const up = await admin.storage.from("payment-logos").upload(path, bytes, { contentType: data.type });
    if (up.error) throw new Error(up.error.message);
    return { url: admin.storage.from("payment-logos").getPublicUrl(path).data.publicUrl };
  });

/* ───────── admin: submissions ───────── */

export const listManualPaymentsAdmin = createServerFn({ method: "GET" }).handler(async () => {
  const { admin } = await requireSiteAdmin();
  const { data, error } = await t(admin, "manual_payments").select("*").order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Any[];
  const ids = [...new Set(rows.map((r) => String(r.user_id)))];
  const { data: users } = ids.length ? await admin.from("users").select("id, email, full_name").in("id", ids) : { data: [] };
  const byId = new Map((users ?? []).map((u) => [u.id, u]));
  return rows.map((r) => ({ ...r, user: byId.get(r.user_id) ?? null })) as Any[];
});

export const getManualProofUrl = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { admin } = await requireSiteAdmin();
    const { data: row } = await t(admin, "manual_payments").select("screenshot_path").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Payment not found");
    const { data: signed, error } = await admin.storage.from("payment-proofs").createSignedUrl(String(row.screenshot_path), 300);
    if (error || !signed) throw new Error(error?.message ?? "Could not open screenshot");
    return { url: signed.signedUrl };
  });

export const decideManualPayment = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ id: z.string().uuid(), decision: z.enum(["approve", "reject"]), reason: z.string().trim().max(500).optional() }).parse(i))
  .handler(async ({ data }) => {
    const { admin, user } = await requireSiteAdmin();
    if (data.decision === "approve") {
      const { error } = await admin.rpc("approve_manual_payment" as never, { p_id: data.id, p_admin: user.id } as never);
      if (error) throw new Error(error.message);
      return { ok: true as const };
    }
    const { data: rows, error } = await t(admin, "manual_payments")
      .update({ status: "rejected", rejection_reason: data.reason || null, rejected_at: new Date().toISOString(), reviewed_by: user.id })
      .eq("id", data.id).eq("status", "pending").select("id");
    if (error) throw new Error(error.message);
    if (!(rows ?? []).length) throw new Error("Only pending payments can be rejected");
    return { ok: true as const };
  });
