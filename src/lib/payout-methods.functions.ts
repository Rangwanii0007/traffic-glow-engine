import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSessionUser } from "./team.server";
import type { Row } from "./member.server";

async function requireSiteAdmin() {
  const { user, admin } = await requireSessionUser();
  const { data } = await admin.from("users").select("role").eq("id", user.id).maybeSingle();
  if ((data as { role?: string } | null)?.role !== "admin") throw new Error("Admins only");
  return { user, admin };
}

const fieldSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers and underscores").max(40),
  label: z.string().trim().min(1).max(80),
  type: z.enum(["text", "email", "number"]).default("text"),
  required: z.boolean().default(true),
  placeholder: z.string().trim().max(120).optional(),
});

export const listPayoutMethodsAdmin = createServerFn({ method: "GET" }).handler(async () => {
  const { admin } = await requireSiteAdmin();
  const { data, error } = await admin.from("admin_payout_methods").select("*").order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Row[];
});

export const savePayoutMethod = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().nullable().optional(),
        name: z.string().trim().min(2).max(80),
        slug: z.string().trim().regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes").max(40),
        is_active: z.boolean().default(true),
        instructions: z.string().trim().max(1000).optional(),
        min_amount: z.number().min(0).max(1000000).default(0),
        sort_order: z.number().int().min(0).max(999).default(0),
        fields: z.array(fieldSchema).max(12),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { admin } = await requireSiteAdmin();
    const { id, ...values } = data;
    const patch = { ...values, instructions: values.instructions ?? null, updated_at: new Date().toISOString() };
    if (id) {
      const { error } = await admin.from("admin_payout_methods").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true as const };
    }
    const { error } = await admin.from("admin_payout_methods").insert(patch);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deletePayoutMethod = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { admin } = await requireSiteAdmin();
    const { error } = await admin.from("admin_payout_methods").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/* ───────── site-admin view of every team withdrawal ───────── */

export const listAllMemberWithdrawals = createServerFn({ method: "GET" }).handler(async () => {
  const { admin } = await requireSiteAdmin();
  const { data, error } = await admin
    .from("member_withdrawals")
    .select("*")
    .order("requested_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  const ids = [...new Set(rows.map((r) => String(r['member_id'])))];
  const { data: members } = ids.length
    ? await admin.from("team_members").select("id, name, email, team_id").in("id", ids)
    : { data: [] };
  const byId = new Map(((members ?? []) as Row[]).map((m) => [String(m['id']), m]));
  return rows.map((r) => ({ ...r, member: byId.get(String(r['member_id'])) ?? null }));
});

export const adminDecideMemberWithdrawal = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["processing", "successful", "rejected"]),
        reason: z.string().trim().max(400).optional(),
        transactionId: z.string().trim().max(160).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { admin, user } = await requireSiteAdmin();
    if (data.decision === "rejected" && !data.reason) throw new Error("Please enter a rejection reason");
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
