import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

export const createCryptoInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: InvoiceInput) => d)
  .handler(async ({ data, context }): Promise<InvoiceResult> => {
    const apiKey = process.env.NOWPAYMENTS_API_KEY;
    if (!apiKey) throw new Error("NOWPAYMENTS_API_KEY not configured");

    const { supabase, userId } = context;

    const { data: plan, error: planErr } = await supabase
      .from("plans")
      .select("id, name, slug, price, duration_days, is_active, is_free")
      .eq("id", data.planId)
      .maybeSingle();
    if (planErr || !plan) throw new Error("Plan not found");
    if (plan.is_free || Number(plan.price) <= 0) throw new Error("Cannot purchase a free plan");
    if (!plan.is_active) throw new Error("Plan not available");

    const orderId = `sub_${userId}_${plan.slug}_${Date.now()}`;
    const supabaseUrl = process.env.SUPABASE_URL!;

    const body = {
      price_amount: Number(plan.price),
      price_currency: "usd",
      pay_currency: data.payCurrency,
      order_id: orderId,
      order_description: `AD4YOU ${plan.name} Plan - ${plan.duration_days} Days`,
      ipn_callback_url: `${supabaseUrl}/functions/v1/nowpayments-webhook`,
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

    await supabase.from("payments").insert({
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { paymentId: string }) => d)
  .handler(async ({ data, context }) => {
    const apiKey = process.env.NOWPAYMENTS_API_KEY;
    if (!apiKey) throw new Error("NOWPAYMENTS_API_KEY not configured");

    // Ensure caller owns this payment
    const { data: own } = await context.supabase
      .from("payments")
      .select("id")
      .eq("nowpayments_id", data.paymentId)
      .maybeSingle();
    if (!own) throw new Error("Payment not found");

    const res = await fetch(`${NP_API}/payment/${data.paymentId}`, {
      headers: { "x-api-key": apiKey },
    });
    if (!res.ok) throw new Error(`Status fetch failed (${res.status})`);
    const j = (await res.json()) as { payment_status: string; actually_paid?: number };
    return { status: j.payment_status, actually_paid: j.actually_paid ?? 0 };
  });
