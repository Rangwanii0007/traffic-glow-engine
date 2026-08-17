import type { SupabaseClient } from "@supabase/supabase-js";

export const REFERRAL_DISCOUNT_PERCENT = 5;

export type ReferralDiscount = {
  valid: boolean;
  reason?: string;
  code?: string;
  referrerName?: string;
  referrerId?: string;
  discountPercent: number;
};

const INVALID = (reason: string): ReferralDiscount => ({
  valid: false,
  reason,
  discountPercent: 0,
});

/**
 * Server-only validation of a referral code for the 5% checkout discount.
 * Never trust a client-supplied price or discount — always call this.
 *
 * Rules (all enforced server-side):
 *  - code must belong to a real, non-banned user
 *  - self-referral is rejected
 *  - the buyer must not have any previously confirmed payment (first purchase only)
 *  - if the buyer was already referred by someone, only that referrer's code works
 */
export async function resolveReferralDiscount(
  admin: SupabaseClient<any, any, any>,
  buyerId: string,
  rawCode: string | null | undefined,
): Promise<ReferralDiscount> {
  const code = (rawCode ?? "").trim().toLowerCase();
  if (!code) return { valid: false, discountPercent: 0 };
  if (code.length < 3 || code.length > 64 || !/^[a-z0-9._-]+$/i.test(code)) {
    return INVALID("Invalid referral code format");
  }

  const { data: referrer } = await admin
    .from("users")
    .select("id, full_name, referral_code, is_banned")
    .ilike("referral_code", code)
    .maybeSingle();

  if (!referrer) return INVALID("Referral code not found");
  if (referrer.is_banned) return INVALID("Referral code is not active");
  if (referrer.id === buyerId) return INVALID("You cannot use your own referral code");

  // First purchase only
  const { data: prior } = await admin
    .from("payments")
    .select("id")
    .eq("user_id", buyerId)
    .in("status", ["confirmed", "completed", "finished", "paid"])
    .limit(1);
  if (prior && prior.length > 0) {
    return INVALID("Referral discount applies to your first purchase only");
  }

  // If already referred, lock the code to that referrer
  const { data: existing } = await admin
    .from("affiliate_referrals")
    .select("referrer_id")
    .eq("referred_id", buyerId)
    .maybeSingle();
  if (existing && existing.referrer_id !== referrer.id) {
    return INVALID("A different referrer is already linked to your account");
  }

  return {
    valid: true,
    code: String(referrer.referral_code ?? code).toLowerCase(),
    referrerName: referrer.full_name ?? undefined,
    referrerId: referrer.id,
    discountPercent: REFERRAL_DISCOUNT_PERCENT,
  };
}

export function applyDiscount(price: number, discountPercent: number) {
  const pct = discountPercent > 0 && discountPercent <= 50 ? discountPercent : 0;
  const final = Math.round(price * (1 - pct / 100) * 100) / 100;
  return Math.max(final, 0.01);
}
