// NOWPayments IPN webhook — verifies HMAC-SHA512 signature, updates payment + activates subscription.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createHmac } from "node:crypto";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const IPN_SECRET = Deno.env.get("NOWPAYMENTS_IPN_SECRET") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-nowpayments-sig",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function sortObject(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortObject);
  if (obj && typeof obj === "object") {
    return Object.keys(obj as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortObject((obj as Record<string, unknown>)[k]);
        return acc;
      }, {});
  }
  return obj;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const rawBody = await req.text();
  const signature = req.headers.get("x-nowpayments-sig") ?? "";

  // Verify HMAC-SHA512 signature (NOWPayments hashes sorted-keys JSON)
  if (IPN_SECRET) {
    try {
      const parsed = JSON.parse(rawBody);
      const sortedJson = JSON.stringify(sortObject(parsed));
      const expected = createHmac("sha512", IPN_SECRET).update(sortedJson).digest("hex");
      if (expected !== signature) {
        console.error("[nowpayments-webhook] invalid signature");
        return new Response("Invalid signature", { status: 401, headers: corsHeaders });
      }
    } catch (e) {
      console.error("[nowpayments-webhook] signature verify error", e);
      return new Response("Bad request", { status: 400, headers: corsHeaders });
    }
  }

  const payload = JSON.parse(rawBody) as {
    payment_id?: string | number;
    payment_status?: string;
    order_id?: string;
    actually_paid?: number;
    pay_currency?: string;
    outcome_amount?: number;
  };

  const npId = String(payload.payment_id ?? "");
  const status = payload.payment_status ?? "waiting";
  if (!npId) return new Response("Missing payment_id", { status: 400, headers: corsHeaders });

  // Map NOWPayments status -> our enum
  const mappedStatus =
    status === "finished" || status === "confirmed" || status === "sending"
      ? "confirmed"
      : status === "failed" || status === "refunded"
        ? "failed"
        : status === "expired"
          ? "expired"
          : "waiting";

  const { data: payment, error: fetchErr } = await admin
    .from("payments")
    .select("id, user_id, plan_id, status")
    .eq("nowpayments_id", npId)
    .maybeSingle();

  if (fetchErr || !payment) {
    console.error("[nowpayments-webhook] payment not found", npId, fetchErr);
    return new Response("Payment not found", { status: 404, headers: corsHeaders });
  }

  await admin
    .from("payments")
    .update({
      status: mappedStatus,
      transaction_id: String(payload.payment_id),
      confirmed_at: mappedStatus === "confirmed" ? new Date().toISOString() : null,
    })
    .eq("id", payment.id);

  // Activate subscription on confirmation
  if (mappedStatus === "confirmed" && payment.status !== "confirmed" && payment.plan_id) {
    const { data: plan } = await admin
      .from("plans")
      .select("duration_days")
      .eq("id", payment.plan_id)
      .maybeSingle();

    const days = plan?.duration_days ?? 30;
    const start = new Date();
    const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);

    await admin.from("subscriptions").upsert(
      {
        user_id: payment.user_id,
        plan_id: payment.plan_id,
        status: "active",
        start_date: start.toISOString(),
        end_date: end.toISOString(),
        duration_days: days,
        created_by: "nowpayments",
      },
      { onConflict: "user_id" },
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
});
