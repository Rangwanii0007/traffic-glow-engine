import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const NP_API = "https://api.nowpayments.io/v1";

type InvoiceInput = {
  planId: string;
  payCurrency: string;
  successUrl: string;
  cancelUrl: string;
};

type InvoiceResult = {
  payment_id: string;
  pay_address: string;
  pay_amount: number;
  pay_currency: string;
  price_amount: number;
  price_currency: string;
  order_id: string;
  expiration_estimate_date?: string;
  invoice_url?: string;
};

function getExternalEnv() {
  const url = process.env.EXTERNAL_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey =
    process.env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("External Supabase credentials not configured");
  }
  return { url, serviceKey };
}

function getAdminClient() {
  const { url, serviceKey } = getExternalEnv();
  return createClient<Database>(url, serviceKey, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

async function authenticateRequest(): Promise<{ userId: string; admin: ReturnType<typeof getAdminClient> }> {
  const request = getRequest();
  const authHeader = request?.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Unauthorized: missing bearer token");
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) throw new Error("Unauthorized: empty token");

  const admin = getAdminClient();
  // Verify token against the EXTERNAL Supabase project using the service role
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    console.error("[nowpayments] token verification failed:", error?.message);
    throw new Error("Unauthorized: invalid session");
  }
  return { userId: data.user.id, admin };
}

export const createCryptoInvoice = createServerFn({ method: "POST" })
  .inputValidator((d: InvoiceInput) => d)
  .handler(async ({ data }): Promise<InvoiceResult> => {
    const apiKey = process.env.NOWPAYMENTS_API_KEY;
    if (!apiKey) throw new Error("NOWPAYMENTS_API_KEY not configured");

    const { userId, admin } = await authenticateRequest();

    const { data: plan, error: planErr } = await admin
      .from("plans")
      .select("id, name, slug, price, duration_days, is_active, is_free")
      .eq("id", data.planId)
      .maybeSingle();
    if (planErr || !plan) throw new Error("Plan not found");
    if (plan.is_free || Number(plan.price) <= 0) throw new Error("Cannot purchase a free plan");
    if (!plan.is_active) throw new Error("Plan not available");

    const orderId = `sub_${userId}_${plan.slug}_${Date.now()}`;
    const { url: externalUrl } = getExternalEnv();
    // IPN must hit our edge function. Webhook is hosted on Lovable Cloud infra
    // but writes to external project via EXTERNAL_SUPABASE_* secrets.
    const ipnBase = process.env.SUPABASE_URL || externalUrl;

    const body = {
      price_amount: Number(plan.price),
      price_currency: "usd",
      pay_currency: data.payCurrency,
      order_id: orderId,
      order_description: `AD4YOU ${plan.name} Plan - ${plan.duration_days} Days`,
      ipn_callback_url: `${ipnBase}/functions/v1/nowpayments-webhook`,
      success_url: data.successUrl,
      cancel_url: data.cancelUrl,
    };

    const res = await fetch(`${NP_API}/payment`, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("[nowpayments] create payment failed", res.status, txt);
      throw new Error(`Payment provider error (${res.status})`);
    }

    const np = (await res.json()) as {
      payment_id: number | string;
      pay_address: string;
      pay_amount: number;
      pay_currency: string;
      price_amount: number;
      price_currency: string;
      order_id: string;
      expiration_estimate_date?: string;
      invoice_url?: string;
    };

    await admin.from("payments").insert({
      user_id: userId,
      plan_id: plan.id,
      amount: Number(plan.price),
      currency: "USD",
      crypto_type: data.payCurrency,
      nowpayments_id: String(np.payment_id),
      nowpayments_order_id: orderId,
      status: "waiting",
    });

    return {
      payment_id: String(np.payment_id),
      pay_address: np.pay_address,
      pay_amount: np.pay_amount,
      pay_currency: np.pay_currency,
      price_amount: np.price_amount,
      price_currency: np.price_currency,
      order_id: np.order_id,
      expiration_estimate_date: np.expiration_estimate_date,
      invoice_url: np.invoice_url,
    };
  });

export const getPaymentStatus = createServerFn({ method: "POST" })
  .inputValidator((d: { paymentId: string }) => d)
  .handler(async ({ data }) => {
    const apiKey = process.env.NOWPAYMENTS_API_KEY;
    if (!apiKey) throw new Error("NOWPAYMENTS_API_KEY not configured");

    const { userId, admin } = await authenticateRequest();

    // Ensure caller owns this payment in external DB
    const { data: own } = await admin
      .from("payments")
      .select("id, user_id")
      .eq("nowpayments_id", data.paymentId)
      .maybeSingle();
    if (!own || own.user_id !== userId) throw new Error("Payment not found");

    const res = await fetch(`${NP_API}/payment/${data.paymentId}`, {
      headers: { "x-api-key": apiKey },
    });
    if (!res.ok) throw new Error(`Status fetch failed (${res.status})`);
    const j = (await res.json()) as { payment_status: string; actually_paid?: number };
    return { status: j.payment_status, actually_paid: j.actually_paid ?? 0 };
  });
