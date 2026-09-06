import { z } from "zod";
import { getAppAdmin, requireAdmin, requireUser } from "./account.server";

/** Masks a referred user's email so a referrer never sees someone else's address. */
function maskEmail(mail: string): string {
  const [local, domain] = mail.split("@");
  if (!local || !domain) return "hidden";
  const head = local.slice(0, 2);
  return `${head}${"*".repeat(Math.max(3, local.length - 2))}@${domain}`;
}

export type PayoutMethodRow = {
  id: string;
  method_type: string;
  details: Record<string, string>;
  is_default: boolean;
};

export type ReferralRow = {
  id: string;
  referred_id: string;
  referred_email: string | null;
  status: string;
  commission_amount: number;
  activated_at: string | null;
  created_at: string;
  name: string;
  email: string;
};

export type WithdrawalRow = {
  id: string;
  amount: number;
  method: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  processed_at: string | null;
};

export type AffiliateOverview = {
  referralCode: string;
  referrals: ReferralRow[];
  withdrawals: WithdrawalRow[];
  payoutMethods: PayoutMethodRow[];
  config: { minWithdrawal: number; commissionPercent: number; lockPayoutMethods: boolean };
  totals: {
    freeCount: number;
    premiumCount: number;
    earned: number;
    withdrawn: number;
    pending: number;
    available: number;
    progressPct: number;
    canWithdraw: boolean;
    payoutMethodsUnlocked: boolean;
  };
  setupRequired: boolean;
};

type Admin = ReturnType<typeof getAppAdmin>;

const SETUP_ERROR = /schema cache|does not exist|PGRST205|42P01/i;

export function isSetupError(message: string | null | undefined) {
  return !!message && SETUP_ERROR.test(message);
}

export const payoutMethodSchema = z.object({
  methodType: z.enum(["wire_bank", "bank", "paypal", "payoneer", "crypto"]),
  details: z.record(z.string(), z.string().trim().min(1).max(300)),
});

function slugFromEmail(email: string, name?: string | null) {
  const raw = (name || email.split("@")[0] || "ad4you").toLowerCase().replace(/[^a-z0-9]/g, "");
  const base = (raw.length >= 3 ? raw : "ad4you").slice(0, 12);
  return `${base}${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns a username-style referral code, creating and persisting one if missing. */
export async function ensureReferralCode(admin: Admin, userId: string, email: string, fullName?: string | null) {
  const { data } = await admin.from("users").select("referral_code, full_name, email").eq("id", userId).maybeSingle();
  const row = data as { referral_code?: string | null; full_name?: string | null; email?: string | null } | null;
  const existing = row?.referral_code ?? null;
  if (existing && !UUID_RE.test(existing)) return existing;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = slugFromEmail(row?.email || email, row?.full_name ?? fullName);
    const { error } = await admin.from("users").update({ referral_code: candidate } as never).eq("id", userId);
    if (!error) return candidate;
    if (!/duplicate|unique/i.test(error.message)) return existing || candidate;
  }
  return existing || slugFromEmail(email, fullName);
}

export const AFFILIATE_CONFIG_KEYS = [
  "affiliate_min_withdrawal",
  "affiliate_commission_percent",
  "affiliate_lock_payout_methods",
] as const;

export async function readAffiliateConfig(admin: Admin) {
  const map = new Map<string, string | null>();

  const loose = admin as unknown as {
    from: (t: string) => { select: (c: string) => { in: (c: string, v: string[]) => Promise<{ data: { key: string; value: string | null }[] | null }> } };
  };
  const primary = await loose.from("affiliate_settings").select("key, value").in("key", AFFILIATE_CONFIG_KEYS as unknown as string[]);
  for (const r of primary.data ?? []) map.set(r.key, r.value);


  // Legacy fallback: config used to live in the shared `settings` table.
  if (map.size === 0) {
    const legacy = await admin.from("settings").select("key, value").in("key", AFFILIATE_CONFIG_KEYS as unknown as string[]);
    for (const r of (legacy.data ?? []) as { key: string; value: string | null }[]) map.set(r.key, r.value);
  }

  const num = (k: string, d: number) => {
    const v = Number(map.get(k));
    return Number.isFinite(v) && v >= 0 ? v : d;
  };
  return {
    minWithdrawal: num("affiliate_min_withdrawal", 100),
    commissionPercent: num("affiliate_commission_percent", 30),
    lockPayoutMethods: (map.get("affiliate_lock_payout_methods") ?? "true") !== "false",
  };
}


export async function buildOverview(userId: string, email: string, fullName?: string | null): Promise<AffiliateOverview> {
  const admin = getAppAdmin();
  const config = await readAffiliateConfig(admin);

  let setupRequired = false;
  let referralCode = "";
  try {
    referralCode = await ensureReferralCode(admin, userId, email, fullName);
  } catch {
    setupRequired = true;
  }

  const refRes = await admin
    .from("affiliate_referrals")
    .select("id, referred_id, referred_email, status, commission_amount, activated_at, created_at")
    // NOTE: referred_email is only used to build a masked label below; the raw
    // address is never returned to the referrer.
    .eq("referrer_id", userId)
    .order("created_at", { ascending: false });
  if (refRes.error && isSetupError(refRes.error.message)) setupRequired = true;
  const rawReferrals = (refRes.data ?? []) as Omit<ReferralRow, "name" | "email">[];

  const ids = rawReferrals.map((r) => r.referred_id);
  const profiles = new Map<string, { full_name: string | null; email: string }>();
  if (ids.length) {
    const { data } = await admin.from("users").select("id, full_name, email").in("id", ids);
    for (const p of (data ?? []) as { id: string; full_name: string | null; email: string }[]) {
      profiles.set(p.id, { full_name: p.full_name, email: p.email });
    }
  }
  const referrals: ReferralRow[] = rawReferrals.map((r) => {
    const p = profiles.get(r.referred_id);
    const mail = p?.email || r.referred_email || "";
    const local = mail.split("@")[0] || "user";
    return {
      ...r,
      referred_email: null,
      commission_amount: Number(r.commission_amount || 0),
      email: maskEmail(mail),
      name: p?.full_name || local,
    };
  });

  const wRes = await admin
    .from("affiliate_withdrawals")
    .select("id, amount, method, status, admin_notes, created_at, processed_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (wRes.error && isSetupError(wRes.error.message)) setupRequired = true;
  const withdrawals = ((wRes.data ?? []) as WithdrawalRow[]).map((w) => ({ ...w, amount: Number(w.amount) }));

  const pmRes = await admin
    .from("user_payout_methods")
    .select("id, method_type, details, is_default")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (pmRes.error && isSetupError(pmRes.error.message)) setupRequired = true;
  const payoutMethods = (pmRes.data ?? []) as PayoutMethodRow[];

  const earned = referrals.reduce((s, r) => s + r.commission_amount, 0);
  const withdrawn = withdrawals.filter((w) => w.status === "completed").reduce((s, w) => s + w.amount, 0);
  const pending = withdrawals.filter((w) => w.status === "pending").reduce((s, w) => s + w.amount, 0);
  const available = Math.max(0, earned - withdrawn - pending);
  const canWithdraw = available >= config.minWithdrawal && config.minWithdrawal > 0;

  return {
    referralCode,
    referrals,
    withdrawals,
    payoutMethods,
    config,
    totals: {
      freeCount: referrals.filter((r) => r.status !== "premium").length,
      premiumCount: referrals.filter((r) => r.status === "premium").length,
      earned,
      withdrawn,
      pending,
      available,
      progressPct: config.minWithdrawal > 0 ? Math.min(100, (available / config.minWithdrawal) * 100) : 100,
      canWithdraw,
      payoutMethodsUnlocked: !config.lockPayoutMethods || canWithdraw || payoutMethods.length > 0,
    },
    setupRequired,
  };
}

export async function currentUserOverview() {
  const { user } = await requireUser();
  return buildOverview(user.id, user.email ?? "", (user.user_metadata?.full_name as string | undefined) ?? null);
}

export async function adminContext() {
  return requireAdmin();
}
