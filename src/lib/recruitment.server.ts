import { createHash, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type Row = Record<string, Json>;

/* ───────────────────────── questions ───────────────────────── */

export const FIELD_TYPES = [
  "short_text", "long_text", "email", "phone", "number", "country", "city",
  "dropdown", "multiple_choice", "checkboxes", "yes_no", "url", "date", "file",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const scoreRuleSchema = z.object({
  op: z.enum(["equals", "contains", "gte", "lte", "is_yes"]),
  value: z.string().trim().max(200).default(""),
  points: z.number().int().min(-100).max(100),
});

export const questionSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  field_key: z.string().trim().regex(/^[a-z0-9_]{2,40}$/, "Use lowercase letters, numbers and _"),
  field_type: z.enum(FIELD_TYPES),
  label: z.string().trim().min(1).max(200),
  description: z.string().trim().max(500).optional().default(""),
  placeholder: z.string().trim().max(120).optional().default(""),
  help_text: z.string().trim().max(300).optional().default(""),
  is_required: z.boolean().default(false),
  is_active: z.boolean().default(true),
  options: z.array(z.string().trim().min(1).max(120)).max(60).default([]),
  min_value: z.number().nullable().optional(),
  max_value: z.number().nullable().optional(),
  min_length: z.number().int().min(0).max(5000).nullable().optional(),
  max_length: z.number().int().min(1).max(5000).nullable().optional(),
  score_rules: z.array(scoreRuleSchema).max(10).default([]),
  sort_order: z.number().int().min(0).max(500).default(0),
});
export type Question = z.infer<typeof questionSchema>;

export const brandingSchema = z.object({
  status: z.enum(["draft", "published", "paused", "closed"]).default("draft"),
  slug: z.string().trim().regex(/^[a-z0-9-]{3,60}$/).optional(),
  headline: z.string().trim().max(140).optional().default(""),
  subheadline: z.string().trim().max(300).optional().default(""),
  about_team: z.string().trim().max(4000).optional().default(""),
  closed_message: z.string().trim().max(1000).optional().default(""),
  success_message: z.string().trim().max(1000).optional().default(""),
  logo_url: z.string().trim().max(600).optional().default(""),
  cover_url: z.string().trim().max(600).optional().default(""),
  primary_color: z.string().trim().max(30).optional().default("#22d3ee"),
  accent_color: z.string().trim().max(30).optional().default("#a855f7"),
  contact_email: z.string().trim().max(160).optional().default(""),
  contact_phone: z.string().trim().max(40).optional().default(""),
  whatsapp: z.string().trim().max(120).optional().default(""),
  website: z.string().trim().max(300).optional().default(""),
  allow_duplicates: z.boolean().default(false),
  scoring_enabled: z.boolean().default(false),
  default_role: z.enum(["team_leader", "editor", "runner", "viewer"]).default("runner"),
});

export function slugify(input: string) {
  const base = input.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return base.length >= 3 ? base : `team-${randomBytes(3).toString("hex")}`;
}

export function newToken() {
  const raw = randomBytes(32).toString("hex");
  return { raw, hash: createHash("sha256").update(raw).digest("hex") };
}
export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export function hashIp(ip: string | null) {
  return ip ? createHash("sha256").update(ip).digest("hex").slice(0, 32) : null;
}

/* ───────────────────────── answer validation ───────────────────────── */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type ValidatedAnswers = {
  answers: Record<string, Json>;
  name: string;
  email: string;
  phone: string | null;
  country: string | null;
  city: string | null;
  score: number;
  scoreMax: number;
};

export function validateAnswers(questions: Row[], raw: Record<string, unknown>, scoringEnabled: boolean): ValidatedAnswers {
  const answers: Record<string, Json> = {};
  const errors: string[] = [];
  let score = 0;
  let scoreMax = 0;

  for (const q of questions) {
    const key = String(q['field_key']);
    const type = String(q['field_type']) as FieldType;
    const label = String(q['label']);
    const required = q['is_required'] === true;
    const input = raw[key];

    let value: Json = null;
    if (type === "checkboxes" || type === "multiple_choice") {
      const list = Array.isArray(input) ? input.map((v) => String(v).trim()).filter(Boolean) : [];
      const allowed = (Array.isArray(q['options']) ? (q['options'] as Json[]).map(String) : []);
      const clean = list.filter((v) => allowed.length === 0 || allowed.includes(v)).slice(0, 60);
      if (required && clean.length === 0) errors.push(`${label} is required`);
      value = clean;
    } else if (type === "yes_no") {
      if (input === true || input === "yes") value = "Yes";
      else if (input === false || input === "no") value = "No";
      else value = null;
      if (required && value === null) errors.push(`${label} is required`);
    } else if (type === "number") {
      const num = input === "" || input === undefined || input === null ? null : Number(input);
      if (num !== null && Number.isNaN(num)) errors.push(`${label} must be a number`);
      else if (num !== null) {
        const min = q['min_value'] === null || q['min_value'] === undefined ? null : Number(q['min_value']);
        const max = q['max_value'] === null || q['max_value'] === undefined ? null : Number(q['max_value']);
        if (min !== null && num < min) errors.push(`${label} must be at least ${min}`);
        if (max !== null && num > max) errors.push(`${label} must be at most ${max}`);
      }
      if (required && num === null) errors.push(`${label} is required`);
      value = num;
    } else {
      const text = typeof input === "string" ? input.trim().slice(0, 5000) : "";
      if (required && !text) errors.push(`${label} is required`);
      if (text) {
        if (type === "email" && !EMAIL_RE.test(text)) errors.push(`${label} must be a valid email address`);
        if (type === "url" && !/^https?:\/\/\S+$/i.test(text)) errors.push(`${label} must start with http:// or https://`);
        if (type === "dropdown") {
          const allowed = (Array.isArray(q['options']) ? (q['options'] as Json[]).map(String) : []);
          if (allowed.length && !allowed.includes(text)) errors.push(`${label} has an invalid option`);
        }
        const minLen = q['min_length'] === null || q['min_length'] === undefined ? null : Number(q['min_length']);
        const maxLen = q['max_length'] === null || q['max_length'] === undefined ? null : Number(q['max_length']);
        if (minLen && text.length < minLen) errors.push(`${label} must be at least ${minLen} characters`);
        if (maxLen && text.length > maxLen) errors.push(`${label} must be at most ${maxLen} characters`);
      }
      value = text || null;
    }

    answers[key] = value;

    if (scoringEnabled) {
      const rules = Array.isArray(q['score_rules']) ? (q['score_rules'] as Json[]) : [];
      for (const ruleRaw of rules) {
        const rule = ruleRaw as { op?: string; value?: string; points?: number };
        const points = Number(rule.points ?? 0);
        if (points > 0) scoreMax += points;
        if (matchesRule(value, rule)) score += points;
      }
    }
  }

  if (errors.length) throw new Error(errors[0]!);

  const name = pickAnswer(questions, answers, ["name", "full_name"], "short_text");
  const email = pickAnswer(questions, answers, ["email", "email_address"], "email");
  if (!name) throw new Error("Please tell us your name");
  if (!email || !EMAIL_RE.test(email)) throw new Error("Please enter a valid email address");

  return {
    answers,
    name: name.slice(0, 120),
    email: email.toLowerCase().slice(0, 160),
    phone: pickAnswer(questions, answers, ["phone", "phone_number", "whatsapp"], "phone") || null,
    country: pickAnswer(questions, answers, ["country"], "country") || null,
    city: pickAnswer(questions, answers, ["city"], "city") || null,
    score: Math.max(0, score),
    scoreMax,
  };
}

function matchesRule(value: Json, rule: { op?: string; value?: string }) {
  const target = String(rule.value ?? "").toLowerCase().trim();
  const asText = Array.isArray(value) ? value.map(String).join(", ").toLowerCase() : String(value ?? "").toLowerCase();
  switch (rule.op) {
    case "equals": return asText === target;
    case "contains": return target.length > 0 && asText.includes(target);
    case "is_yes": return asText === "yes" || asText === "true";
    case "gte": return Number(value) >= Number(rule.value);
    case "lte": return Number(value) <= Number(rule.value);
    default: return false;
  }
}

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pickAnswer(questions: Row[], answers: Record<string, Json>, keys: string[], type: FieldType) {
  const wanted = keys.map(norm);
  // 1) exact / normalised key match
  for (const [k, v] of Object.entries(answers)) {
    if (typeof v === "string" && v.trim() && wanted.includes(norm(k))) return v.trim();
  }
  // 2) declared field type
  const byType = questions.find((q) => String(q['field_type']) === type);
  if (byType) {
    const v = answers[String(byType['field_key'])];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  // 3) fuzzy match on key OR label (handles "E-mail", "Full name", "your_email" ...)
  for (const q of questions) {
    const key = String(q['field_key'] ?? "");
    const label = norm(String(q['label'] ?? ""));
    const nk = norm(key);
    const hit = wanted.some((w) => nk.includes(w) || w.includes(nk) || label.includes(w));
    if (!hit) continue;
    const v = answers[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  // 4) last resort for email: any answer that looks like an email address
  if (type === "email") {
    for (const v of Object.values(answers)) {
      if (typeof v === "string" && EMAIL_RE.test(v.trim())) return v.trim();
    }
  }
  return "";
}


/* ───────────────────── global email uniqueness (server-side) ───────────────── */

export function normEmail(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, "").toLowerCase();
}

/** Escapes an email so it can be used safely inside a PostgREST ilike pattern. */
function likeSafe(email: string) {
  return email.replace(/[%_,]/g, (c) => `\\${c}`);
}

export type EmailOwner =
  | { taken: false }
  | { taken: true; kind: "account" | "member"; teamId: string | null };

/**
 * Is this email already used anywhere on AD4YOU? Checked with the service role
 * so it cannot be bypassed from the browser. Case-insensitive and space-safe.
 * Uses the database helper when present, otherwise falls back to direct reads.
 */
export async function findEmailOwner(admin: SupabaseClient, rawEmail: string): Promise<EmailOwner> {
  const email = normEmail(rawEmail);
  if (!email) return { taken: false };

  const rpc = await admin.rpc("ad4you_email_owner", { p_email: email });
  if (!rpc.error && rpc.data) {
    const row = rpc.data as { kind?: string | null; team_id?: string | null };
    if (row.kind === "account" || row.kind === "member") {
      return { taken: true, kind: row.kind, teamId: row.team_id ?? null };
    }
    if (row.kind === null || row.kind === "none") return { taken: false };
  }

  const pattern = likeSafe(email);
  const members = await admin.from("team_members").select("id, team_id").ilike("email", pattern).limit(1);
  const member = (members.data ?? [])[0] as { team_id?: string } | undefined;
  if (member) return { taken: true, kind: "member", teamId: member.team_id ?? null };

  const users = await admin.from("users").select("id").ilike("email", pattern).limit(1);
  if ((users.data ?? []).length) return { taken: true, kind: "account", teamId: null };

  return { taken: false };
}

/* ───────────────────────── member capacity (reuses plan limits) ───────────── */


export async function memberCapacity(admin: SupabaseClient, team: Row) {
  const { data: activeRows } = await admin
    .from("team_members").select("id", { count: "exact", head: true }).eq("team_id", String(team['id'])).eq("is_active", true);
  void activeRows;
  const { count } = await admin
    .from("team_members").select("id", { count: "exact", head: true }).eq("team_id", String(team['id'])).eq("is_active", true);
  const active = Number(count ?? 0);

  const override = team['max_members'] === null || team['max_members'] === undefined ? null : Number(team['max_members']);
  let limit = override && override > 0 ? override : null;

  if (!limit && team['owner_id']) {
    const { data: subs } = await admin
      .from("subscriptions")
      .select("status, end_date, plans(max_pcs)")
      .eq("user_id", String(team['owner_id']))
      .eq("status", "active")
      .order("end_date", { ascending: false })
      .limit(3);
    for (const row of (subs ?? []) as Row[]) {
      const planRow = row['plans'] as Json;
      const plan = Array.isArray(planRow) ? (planRow[0] as Row | undefined) : (planRow as Row | null);
      const max = plan ? Number(plan['max_pcs'] ?? 0) : 0;
      if (max > 0) { limit = Math.max(limit ?? 0, max); }
    }
  }

  return { active, limit, isFull: limit !== null && active >= limit };
}

/* ───────────────────────── branded emails ───────────────────────── */

export const TEMPLATE_KINDS = ["received", "accepted", "rejected", "welcome"] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export const DEFAULT_TEMPLATES: Record<TemplateKind, { subject: string; body: string }> = {
  received: {
    subject: "We received your application — {{company_name}}",
    body: `Hello {{applicant_name}},

Thank you for applying to join {{company_name}}.

Your application has been received and is currently under review. You will get an email as soon as the team owner reviews it.

Application reference: {{application_id}}`,
  },
  accepted: {
    subject: "Congratulations! You have joined {{company_name}}",
    body: `Hello {{applicant_name}},

Congratulations! Your application to join {{company_name}} has been accepted and your Team Member account has been created successfully.

ACCOUNT DETAILS

Name: {{applicant_name}}
Email: {{applicant_email}}
Temporary password: {{temporary_password}}
Login: {{login_link}}

After logging in, please open your Profile and change your temporary password for security.

Welcome to the team!`,
  },
  rejected: {
    subject: "Application status update — {{company_name}}",
    body: `Hello {{applicant_name}},

Thank you for your interest in joining {{company_name}}.

After reviewing your application, we are unable to accept it at this time.

Reason: {{rejection_reason}}

We appreciate the time you took to apply.`,
  },
  welcome: {
    subject: "Welcome to {{company_name}}",
    body: `Hello {{applicant_name}},

Welcome to {{company_name}}! Your team member account is ready.

Sign in here: {{login_link}}`,
  },
};


export type EmailBrand = {
  business_name: string;
  owner_name: string;
  team_name: string;
  logo_url: string;
  primary_color: string;
  accent_color: string;
  reply_to: string;
  contact_email: string;
  contact_phone: string;
  whatsapp: string;
  website: string;
  footer_text: string;
  signature: string;
};

export async function loadBrand(admin: SupabaseClient, team: Row): Promise<EmailBrand> {
  const { data } = await admin.from("team_email_settings").select("*").eq("team_id", String(team['id'])).maybeSingle();
  const s = (data ?? {}) as Row;
  const teamName = String(s['team_name'] || team['name'] || "AD4YOU Team");
  const businessName = String(s['business_name'] || team['company_name'] || teamName);
  return {
    business_name: businessName,
    owner_name: String(s['owner_name'] || team['admin_name'] || ""),
    team_name: teamName,
    logo_url: String(s['logo_url'] || ""),
    primary_color: String(s['primary_color'] || "#22d3ee"),
    accent_color: String(s['accent_color'] || "#a855f7"),
    reply_to: String(s['reply_to'] || s['contact_email'] || team['admin_contact_email'] || ""),
    contact_email: String(s['contact_email'] || team['admin_contact_email'] || ""),
    contact_phone: String(s['contact_phone'] || team['admin_phone'] || ""),
    whatsapp: String(s['whatsapp'] || team['admin_whatsapp'] || ""),
    website: String(s['website'] || ""),
    footer_text: String(s['footer_text'] || ""),
    signature: String(s['signature'] || [businessName, String(s['owner_name'] || team['admin_name'] || "")].filter(Boolean).join(" · ")),
  };
}


export function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderVars(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, key: string) => vars[key.toLowerCase()] ?? "");
}

export function renderEmailHtml(brand: EmailBrand, bodyText: string) {
  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 16px;line-height:1.65;color:#111827;font-size:15px">${escapeHtml(block).replace(/\n/g, "<br />")}</p>`)
    .join("");
  const contactBits = [
    brand.contact_email ? `Email: ${escapeHtml(brand.contact_email)}` : "",
    brand.contact_phone ? `Phone: ${escapeHtml(brand.contact_phone)}` : "",
    brand.whatsapp ? `WhatsApp: ${escapeHtml(brand.whatsapp)}` : "",
    brand.website ? `Web: ${escapeHtml(brand.website)}` : "",
  ].filter(Boolean).join(" &nbsp;·&nbsp; ");

  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;padding:24px;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.08)">
      <tr><td style="background:${escapeHtml(brand.primary_color)};padding:22px 28px" align="left">
        ${brand.logo_url ? `<img src="${escapeHtml(brand.logo_url)}" alt="${escapeHtml(brand.team_name)}" height="36" style="height:36px;display:block;border:0" />`
          : `<span style="font-size:19px;font-weight:700;color:#0b1020">${escapeHtml(brand.business_name)}</span>`}
      </td></tr>
      <tr><td style="padding:28px">
        ${paragraphs}
        <p style="margin:24px 0 0;color:#374151;font-size:14px">Regards,<br /><strong>${escapeHtml(brand.signature)}</strong></p>
      </td></tr>
      <tr><td style="padding:18px 28px;background:#f9fafb;color:#6b7280;font-size:12px;line-height:1.6">
        ${contactBits ? `<div>${contactBits}</div>` : ""}
        ${brand.footer_text ? `<div style="margin-top:6px">${escapeHtml(brand.footer_text)}</div>` : ""}
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

export type EmailResult = {
  id: string | null;
  status: "sent" | "failed" | "queued";
  error: string | null;
};

export function emailProviderConfigured() {
  return Boolean(process.env['RESEND_API_KEY'] && process.env['EMAIL_FROM']);
}

/**
 * Renders and stores the branded email, then tries to deliver it with the
 * platform's transactional provider. Nothing is ever lost: unsent mail stays
 * in team_email_outbox with a clear status so the owner never sees a false
 * "email sent" message.
 */
export async function queueEmail(
  admin: SupabaseClient,
  args: { teamId: string; applicationId?: string | null; kind: string; to: string; subject: string; bodyText: string; brand: EmailBrand },
): Promise<EmailResult> {
  const html = renderEmailHtml(args.brand, args.bodyText);
  const { data } = await admin
    .from("team_email_outbox")
    .insert({
      team_id: args.teamId,
      application_id: args.applicationId ?? null,
      kind: args.kind,
      to_email: args.to,
      reply_to: args.brand.reply_to || null,
      subject: args.subject,
      html,
      status: "queued",
    })
    .select("id")
    .single();
  const id = data ? String((data as Row)['id']) : null;

  if (!emailProviderConfigured()) {
    const message = "Email sending is not configured yet, so this message is saved in the outbox instead of being delivered.";
    if (id) await admin.from("team_email_outbox").update({ status: "failed", error: message }).eq("id", id);
    return { id, status: "failed", error: message };
  }

  const sent = await trySend(admin, id, args, html);
  return { id, ...sent };
}

async function trySend(
  admin: SupabaseClient,
  id: string | null,
  args: { to: string; subject: string; brand: EmailBrand },
  html: string,
): Promise<{ status: "sent" | "failed"; error: string | null }> {
  const apiKey = process.env['RESEND_API_KEY']!;
  const from = process.env['EMAIL_FROM']!;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: `${args.brand.business_name} <${from}>`,
        to: [args.to],
        subject: args.subject,
        html,
        ...(args.brand.reply_to ? { reply_to: args.brand.reply_to } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Email provider rejected the message (${res.status}): ${(await res.text()).slice(0, 200)}`);
    if (id) await admin.from("team_email_outbox").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", id);
    return { status: "sent", error: null };
  } catch (error) {
    const message = (error as Error).message.slice(0, 500);
    if (id) await admin.from("team_email_outbox").update({ status: "failed", error: message }).eq("id", id);
    return { status: "failed", error: message };
  }
}

/** Re-delivers an email that is already stored in the outbox (retry button). */
export async function resendOutboxEmail(admin: SupabaseClient, teamId: string, id: string): Promise<EmailResult> {
  const { data } = await admin
    .from("team_email_outbox")
    .select("id, to_email, subject, html, reply_to, team_id")
    .eq("id", id)
    .eq("team_id", teamId)
    .maybeSingle();
  if (!data) throw new Error("Email not found");
  const row = data as Row;
  if (!emailProviderConfigured()) {
    const message = "Email sending is not configured yet, so this message is saved in the outbox instead of being delivered.";
    await admin.from("team_email_outbox").update({ status: "failed", error: message }).eq("id", id);
    return { id, status: "failed", error: message };
  }
  const { data: teamRow } = await admin.from("teams").select("*").eq("id", teamId).maybeSingle();
  const brand = await loadBrand(admin, (teamRow ?? { id: teamId }) as Row);
  if (row['reply_to']) brand.reply_to = String(row['reply_to']);
  const sent = await trySend(
    admin,
    id,
    { to: String(row['to_email']), subject: String(row['subject']), brand },
    String(row['html']),
  );
  return { id, ...sent };
}



export async function logEvent(
  admin: SupabaseClient,
  applicationId: string,
  teamId: string,
  event: string,
  detail?: string,
  actor?: string,
) {
  await admin.from("team_application_events").insert({
    application_id: applicationId, team_id: teamId, event, detail: detail ?? null, actor: actor ?? null,
  });
}
