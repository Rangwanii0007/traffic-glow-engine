import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { defaultPermissions, getTeamAdmin, hashMemberPassword, requireTeam, throwIf, WORKER_ROLES } from "./team.server";
import {
  brandingSchema, DEFAULT_TEMPLATES, hashIp, hashToken, loadBrand, logEvent, memberCapacity, newToken,
  queueEmail, questionSchema, renderVars, slugify, TEMPLATE_KINDS, validateAnswers,
  type Json, type Row, type TemplateKind,
} from "./recruitment.server";

const uuid = z.string().uuid();

function origin() {
  const request = getRequest();
  const url = request?.url ? new URL(request.url) : null;
  const configured = process.env['PUBLIC_SITE_URL'];
  return (configured || (url ? url.origin : "https://ad4you.click")).replace(/\/$/, "");
}

/* ═════════════════════════ owner: form + questions ═════════════════════════ */

async function ensureForm(admin: ReturnType<typeof getTeamAdmin>, team: Row) {
  const teamId = String(team['id']);
  const { data } = await admin.from("team_join_forms").select("*").eq("team_id", teamId).maybeSingle();
  if (data) return data as Row;
  let slug = slugify(String(team['name'] ?? "team"));
  const { data: clash } = await admin.from("team_join_forms").select("id").eq("slug", slug).maybeSingle();
  if (clash) slug = `${slug}-${teamId.slice(0, 6)}`;
  const { data: created, error } = await admin
    .from("team_join_forms")
    .insert({
      team_id: teamId,
      owner_id: team['owner_id'] ?? null,
      slug,
      status: "draft",
      headline: `Join ${String(team['name'] ?? "our team")}`,
      subheadline: "We are currently accepting applications for new team members.",
      success_message: "Thank you for applying. Your application has been received and is under review. You will receive an update by email after the team owner reviews it.",
      closed_message: "We are not accepting new applications right now. Please check back later.",
    })
    .select("*")
    .single();
  throwIf(error);
  return created as Row;
}

async function ensureTemplates(admin: ReturnType<typeof getTeamAdmin>, teamId: string) {
  const { data } = await admin.from("team_email_templates").select("kind").eq("team_id", teamId);
  const have = new Set(((data ?? []) as Row[]).map((r) => String(r['kind'])));
  const missing = TEMPLATE_KINDS.filter((k) => !have.has(k));
  if (missing.length) {
    await admin.from("team_email_templates").insert(
      missing.map((kind) => ({ team_id: teamId, kind, subject: DEFAULT_TEMPLATES[kind].subject, body: DEFAULT_TEMPLATES[kind].body })),
    );
  }
}

export const getRecruitment = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ teamId: uuid }).parse(input))
  .handler(async ({ data }) => {
    const { admin, team } = await requireTeam(data.teamId);
    const form = await ensureForm(admin, team as Row);
    await ensureTemplates(admin, data.teamId);

    const [questionsRes, settingsRes, templatesRes, statsRes, capacity] = await Promise.all([
      admin.from("team_join_questions").select("*").eq("form_id", String(form['id'])).order("sort_order", { ascending: true }),
      admin.from("team_email_settings").select("*").eq("team_id", data.teamId).maybeSingle(),
      admin.from("team_email_templates").select("*").eq("team_id", data.teamId),
      admin.from("team_applications").select("status").eq("team_id", data.teamId),
      memberCapacity(admin, team as Row),
    ]);

    const statuses = ((statsRes.data ?? []) as Row[]).map((r) => String(r['status']));
    const counts = {
      all: statuses.length,
      pending: statuses.filter((s) => s === "pending").length,
      under_review: statuses.filter((s) => s === "under_review").length,
      accepted: statuses.filter((s) => s === "accepted").length,
      rejected: statuses.filter((s) => s === "rejected").length,
    };

    return {
      form,
      questions: (questionsRes.data ?? []) as Row[],
      settings: (settingsRes.data ?? null) as Row | null,
      templates: (templatesRes.data ?? []) as Row[],
      counts,
      capacity,
      publicUrl: `${origin()}/join/${String(form['slug'])}`,
    };
  });

export const saveJoinForm = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ teamId: uuid, values: brandingSchema }).parse(input))
  .handler(async ({ data }) => {
    const { admin, team } = await requireTeam(data.teamId);
    const form = await ensureForm(admin, team as Row);
    const patch: Record<string, Json> = { ...data.values } as Record<string, Json>;

    if (data.values.slug && data.values.slug !== String(form['slug'])) {
      const { data: clash } = await admin.from("team_join_forms").select("id").eq("slug", data.values.slug).maybeSingle();
      if (clash) throw new Error("That link name is already taken — pick another");
      patch['slug'] = data.values.slug;
    } else {
      delete patch['slug'];
    }

    if (data.values.status === "published") {
      const { count } = await admin
        .from("team_join_questions").select("id", { count: "exact", head: true }).eq("form_id", String(form['id'])).eq("is_active", true);
      if (!Number(count ?? 0)) throw new Error("Add at least one question before publishing the form");
    }

    const { error } = await admin.from("team_join_forms").update(patch).eq("id", String(form['id']));
    throwIf(error);
    return { ok: true as const, slug: String(patch['slug'] ?? form['slug']) };
  });

export const saveQuestions = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ teamId: uuid, questions: z.array(questionSchema).max(60) }).parse(input))
  .handler(async ({ data }) => {
    const { admin, team } = await requireTeam(data.teamId);
    const form = await ensureForm(admin, team as Row);
    const formId = String(form['id']);

    const keys = data.questions.map((q) => q.field_key);
    if (new Set(keys).size !== keys.length) throw new Error("Two questions share the same field name");

    const { data: existing } = await admin.from("team_join_questions").select("id").eq("form_id", formId);
    const keepIds = new Set(data.questions.map((q) => q.id).filter(Boolean) as string[]);
    const removeIds = ((existing ?? []) as Row[]).map((r) => String(r['id'])).filter((id) => !keepIds.has(id));
    if (removeIds.length) await admin.from("team_join_questions").delete().in("id", removeIds);

    for (const [index, q] of data.questions.entries()) {
      const payload = {
        form_id: formId,
        field_key: q.field_key,
        field_type: q.field_type,
        label: q.label,
        description: q.description || null,
        placeholder: q.placeholder || null,
        help_text: q.help_text || null,
        is_required: q.is_required,
        is_active: q.is_active,
        options: q.options,
        min_value: q.min_value ?? null,
        max_value: q.max_value ?? null,
        min_length: q.min_length ?? null,
        max_length: q.max_length ?? null,
        score_rules: q.score_rules,
        sort_order: index,
      };
      if (q.id) {
        const { error } = await admin.from("team_join_questions").update(payload).eq("id", q.id).eq("form_id", formId);
        throwIf(error);
      } else {
        const { error } = await admin.from("team_join_questions").insert(payload);
        throwIf(error);
      }
    }
    return { ok: true as const };
  });

/* ═════════════════════════ owner: email branding ═════════════════════════ */

export const saveEmailSettings = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      teamId: uuid,
      values: z.object({
        business_name: z.string().trim().max(120).optional().default(""),
        team_name: z.string().trim().max(120).optional().default(""),
        logo_url: z.string().trim().max(600).optional().default(""),
        primary_color: z.string().trim().max(30).optional().default("#22d3ee"),
        reply_to: z.string().trim().max(160).optional().default(""),
        contact_email: z.string().trim().max(160).optional().default(""),
        contact_phone: z.string().trim().max(40).optional().default(""),
        whatsapp: z.string().trim().max(120).optional().default(""),
        website: z.string().trim().max(300).optional().default(""),
        footer_text: z.string().trim().max(500).optional().default(""),
        signature: z.string().trim().max(160).optional().default(""),
      }),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { admin } = await requireTeam(data.teamId);
    const { error } = await admin
      .from("team_email_settings")
      .upsert({ team_id: data.teamId, ...data.values, updated_at: new Date().toISOString() }, { onConflict: "team_id" });
    throwIf(error);
    return { ok: true as const };
  });

export const saveEmailTemplate = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      teamId: uuid,
      kind: z.enum(TEMPLATE_KINDS),
      subject: z.string().trim().min(3).max(200),
      body: z.string().trim().min(10).max(8000),
      is_active: z.boolean().default(true),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { admin } = await requireTeam(data.teamId);
    const { error } = await admin.from("team_email_templates").upsert(
      { team_id: data.teamId, kind: data.kind, subject: data.subject, body: data.body, is_active: data.is_active, updated_at: new Date().toISOString() },
      { onConflict: "team_id,kind" },
    );
    throwIf(error);
    return { ok: true as const };
  });

/* ═════════════════════════ owner: application queue ═════════════════════════ */

export const listApplications = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      teamId: uuid,
      status: z.enum(["all", "pending", "under_review", "accepted", "rejected", "archived"]).default("all"),
      search: z.string().trim().max(120).default(""),
      sort: z.enum(["newest", "oldest", "score"]).default("newest"),
      answerFilters: z.array(z.object({
        key: z.string().trim().max(40),
        op: z.enum(["equals", "contains", "gte", "lte"]),
        value: z.string().trim().max(120),
      })).max(6).default([]),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { admin } = await requireTeam(data.teamId);
    let query = admin.from("team_applications").select("*").eq("team_id", data.teamId);
    if (data.status !== "all") query = query.eq("status", data.status);
    if (data.search) {
      const like = `%${data.search}%`;
      query = query.or(`applicant_name.ilike.${like},applicant_email.ilike.${like},country.ilike.${like},city.ilike.${like}`);
    }
    query = data.sort === "score"
      ? query.order("score", { ascending: false })
      : query.order("submitted_at", { ascending: data.sort === "oldest" });
    const { data: rows, error } = await query.limit(500);
    throwIf(error);

    let list = (rows ?? []) as Row[];
    for (const filter of data.answerFilters) {
      if (!filter.key || !filter.value) continue;
      list = list.filter((row) => {
        const answers = (row['answers'] ?? {}) as Record<string, Json>;
        const raw = answers[filter.key];
        const text = Array.isArray(raw) ? raw.map(String).join(", ").toLowerCase() : String(raw ?? "").toLowerCase();
        const target = filter.value.toLowerCase();
        if (filter.op === "equals") return text === target;
        if (filter.op === "contains") return text.includes(target);
        const num = Number(String(raw ?? "").replace(/[^0-9.]/g, ""));
        if (Number.isNaN(num)) return false;
        return filter.op === "gte" ? num >= Number(filter.value) : num <= Number(filter.value);
      });
    }
    return list;
  });

export const getApplication = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ teamId: uuid, id: uuid }).parse(input))
  .handler(async ({ data }) => {
    const { admin, team } = await requireTeam(data.teamId);
    const { data: app } = await admin.from("team_applications").select("*").eq("id", data.id).eq("team_id", data.teamId).maybeSingle();
    if (!app) throw new Error("Application not found");
    const form = await ensureForm(admin, team as Row);
    const [questionsRes, eventsRes] = await Promise.all([
      admin.from("team_join_questions").select("*").eq("form_id", String(form['id'])).order("sort_order", { ascending: true }),
      admin.from("team_application_events").select("*").eq("application_id", data.id).order("created_at", { ascending: false }),
    ]);
    if (String((app as Row)['status']) === "pending") {
      await logEvent(admin, data.id, data.teamId, "viewed", "Opened by the team owner", "owner");
    }
    return { application: app as Row, questions: (questionsRes.data ?? []) as Row[], events: (eventsRes.data ?? []) as Row[] };
  });

export const setApplicationStatus = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      teamId: uuid,
      ids: z.array(uuid).min(1).max(200),
      status: z.enum(["pending", "under_review", "archived", "withdrawn"]),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { admin } = await requireTeam(data.teamId);
    const { error } = await admin
      .from("team_applications")
      .update({ status: data.status, reviewed_at: new Date().toISOString() })
      .in("id", data.ids)
      .eq("team_id", data.teamId);
    throwIf(error);
    for (const id of data.ids) await logEvent(admin, id, data.teamId, `status_${data.status}`, `Status changed to ${data.status}`, "owner");
    return { ok: true as const, count: data.ids.length };
  });

async function templateFor(admin: ReturnType<typeof getTeamAdmin>, teamId: string, kind: TemplateKind) {
  const { data } = await admin.from("team_email_templates").select("*").eq("team_id", teamId).eq("kind", kind).maybeSingle();
  const row = (data ?? null) as Row | null;
  if (row && row['is_active'] === false) return null;
  return {
    subject: String(row?.['subject'] ?? DEFAULT_TEMPLATES[kind].subject),
    body: String(row?.['body'] ?? DEFAULT_TEMPLATES[kind].body),
  };
}

export const acceptApplication = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      teamId: uuid,
      id: uuid,
      role: z.enum(WORKER_ROLES).default("runner"),
      sendEmail: z.boolean().default(true),
      createMember: z.boolean().default(true),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { admin, team, user } = await requireTeam(data.teamId);
    const { data: appRow } = await admin.from("team_applications").select("*").eq("id", data.id).eq("team_id", data.teamId).maybeSingle();
    if (!appRow) throw new Error("Application not found");
    const app = appRow as Row;
    if (String(app['status']) === "accepted") throw new Error("This application is already accepted");

    const email = String(app['applicant_email']).toLowerCase();
    let memberId = app['member_id'] ? String(app['member_id']) : null;
    let setupLink = "";

    if (data.createMember && !memberId) {
      const capacity = await memberCapacity(admin, team as Row);
      if (capacity.isFull) {
        throw new Error(`Your team is full (${capacity.active}/${capacity.limit} members). Free a slot or upgrade your plan before accepting.`);
      }
      const { data: existing } = await admin.from("team_members").select("id, team_id").ilike("email", email).maybeSingle();
      if (existing && String((existing as Row)['team_id']) !== data.teamId) {
        throw new Error("This email already belongs to a team member in another team");
      }
      if (existing) {
        memberId = String((existing as Row)['id']);
        await admin.from("team_members").update({ is_active: true, application_id: data.id }).eq("id", memberId);
      } else {
        if (data.role === "team_leader") {
          const { data: leader } = await admin.from("team_members").select("id").eq("team_id", data.teamId).eq("role", "team_leader").maybeSingle();
          if (leader) throw new Error("This team already has a Team Leader");
        }
        const { data: created, error } = await admin
          .from("team_members")
          .insert({
            team_id: data.teamId,
            name: String(app['applicant_name']),
            email,
            password_hash: null,
            must_set_password: true,
            role: data.role,
            allowed_tools: defaultPermissions(data.role),
            is_active: true,
            is_online: false,
            phone: app['applicant_phone'] ?? null,
            country: app['country'] ?? null,
            city: app['city'] ?? null,
            application_id: data.id,
          })
          .select("id")
          .single();
        throwIf(error);
        memberId = String((created as Row)['id']);
      }

      const { raw, hash } = newToken();
      await admin.from("member_setup_tokens").insert({ member_id: memberId, team_id: data.teamId, token_hash: hash });
      setupLink = `${origin()}/team-setup/${raw}`;

      const { count } = await admin.from("team_members").select("id", { count: "exact", head: true }).eq("team_id", data.teamId);
      await admin.from("teams").update({ total_members: Number(count ?? 0) }).eq("id", data.teamId);
      await logEvent(admin, data.id, data.teamId, "member_created", "Team member account created", "system");
    }

    const now = new Date().toISOString();
    const { error: upErr } = await admin
      .from("team_applications")
      .update({ status: "accepted", accepted_at: now, reviewed_at: now, reviewed_by: user.id, member_id: memberId })
      .eq("id", data.id);
    throwIf(upErr);
    await logEvent(admin, data.id, data.teamId, "accepted", "Application accepted", "owner");

    if (data.sendEmail) {
      const brand = await loadBrand(admin, team as Row);
      const tpl = await templateFor(admin, data.teamId, "accepted");
      if (tpl) {
        const vars = {
          applicant_name: String(app['applicant_name']),
          team_name: brand.team_name,
          team_owner_name: String(team['admin_name'] ?? brand.business_name),
          application_id: data.id,
          rejection_reason: "",
          contact_email: brand.contact_email,
          contact_phone: brand.contact_phone,
          whatsapp: brand.whatsapp,
          website: brand.website,
          login_link: `${origin()}/team-login`,
          account_setup_link: setupLink ? `Set your password and activate your account here: ${setupLink}` : "",
        };
        await queueEmail(admin, {
          teamId: data.teamId, applicationId: data.id, kind: "accepted", to: email,
          subject: renderVars(tpl.subject, vars), bodyText: renderVars(tpl.body, vars), brand,
        });
        await logEvent(admin, data.id, data.teamId, "email_accepted", "Acceptance email prepared and sent", "system");
      }
    }
    return { ok: true as const, memberId, setupLink };
  });

export const rejectApplication = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      teamId: uuid,
      ids: z.array(uuid).min(1).max(100),
      reason: z.string().trim().max(1000).default(""),
      sendEmail: z.boolean().default(true),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { admin, team, user } = await requireTeam(data.teamId);
    const { data: rows } = await admin.from("team_applications").select("*").in("id", data.ids).eq("team_id", data.teamId);
    const apps = (rows ?? []) as Row[];
    const now = new Date().toISOString();
    const { error } = await admin
      .from("team_applications")
      .update({ status: "rejected", rejected_at: now, reviewed_at: now, reviewed_by: user.id, rejection_reason: data.reason || null })
      .in("id", apps.map((a) => String(a['id'])))
      .eq("team_id", data.teamId);
    throwIf(error);

    const brand = await loadBrand(admin, team as Row);
    const tpl = data.sendEmail ? await templateFor(admin, data.teamId, "rejected") : null;
    for (const app of apps) {
      const id = String(app['id']);
      await logEvent(admin, id, data.teamId, "rejected", data.reason || "Application rejected", "owner");
      if (!tpl) continue;
      const vars = {
        applicant_name: String(app['applicant_name']),
        team_name: brand.team_name,
        team_owner_name: String(team['admin_name'] ?? brand.business_name),
        application_id: id,
        rejection_reason: data.reason || "Your application did not match our current team requirements.",
        contact_email: brand.contact_email,
        contact_phone: brand.contact_phone,
        whatsapp: brand.whatsapp,
        website: brand.website,
        login_link: `${origin()}/team-login`,
        account_setup_link: "",
      };
      await queueEmail(admin, {
        teamId: data.teamId, applicationId: id, kind: "rejected", to: String(app['applicant_email']),
        subject: renderVars(tpl.subject, vars), bodyText: renderVars(tpl.body, vars), brand,
      });
      await logEvent(admin, id, data.teamId, "email_rejected", "Rejection email prepared and sent", "system");
    }
    return { ok: true as const, count: apps.length };
  });

export const listEmailOutbox = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ teamId: uuid }).parse(input))
  .handler(async ({ data }) => {
    const { admin } = await requireTeam(data.teamId);
    const { data: rows } = await admin
      .from("team_email_outbox").select("id, kind, to_email, subject, status, error, created_at, sent_at")
      .eq("team_id", data.teamId).order("created_at", { ascending: false }).limit(50);
    return (rows ?? []) as Row[];
  });

/* ═════════════════════════ public: joining form ═════════════════════════ */

export const getPublicJoinForm = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ slug: z.string().trim().min(3).max(60) }).parse(input))
  .handler(async ({ data }) => {
    const admin = getTeamAdmin();
    const { data: formRow } = await admin.from("team_join_forms").select("*").eq("slug", data.slug.toLowerCase()).maybeSingle();
    if (!formRow) return { found: false as const };
    const form = formRow as Row;
    const { data: teamRow } = await admin.from("teams").select("name, company_name").eq("id", String(form['team_id'])).maybeSingle();
    const status = String(form['status']);
    const branding = {
      slug: String(form['slug']),
      team_name: String((teamRow as Row | null)?.['name'] ?? "AD4YOU Team"),
      company_name: String((teamRow as Row | null)?.['company_name'] ?? ""),
      headline: String(form['headline'] ?? ""),
      subheadline: String(form['subheadline'] ?? ""),
      about_team: String(form['about_team'] ?? ""),
      logo_url: String(form['logo_url'] ?? ""),
      cover_url: String(form['cover_url'] ?? ""),
      primary_color: String(form['primary_color'] ?? "#22d3ee"),
      accent_color: String(form['accent_color'] ?? "#a855f7"),
      contact_email: String(form['contact_email'] ?? ""),
      contact_phone: String(form['contact_phone'] ?? ""),
      whatsapp: String(form['whatsapp'] ?? ""),
      website: String(form['website'] ?? ""),
      success_message: String(form['success_message'] ?? ""),
      closed_message: String(form['closed_message'] ?? ""),
    };
    if (status !== "published") return { found: true as const, open: false as const, status, branding, questions: [] as Row[] };

    const { data: questions } = await admin
      .from("team_join_questions")
      .select("id, field_key, field_type, label, description, placeholder, help_text, is_required, options, min_value, max_value, min_length, max_length, sort_order")
      .eq("form_id", String(form['id']))
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    return { found: true as const, open: true as const, status, branding, questions: (questions ?? []) as Row[] };
  });

export const submitApplication = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      slug: z.string().trim().min(3).max(60),
      answers: z.record(z.string().max(40), z.unknown()),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const admin = getTeamAdmin();
    const { data: formRow } = await admin.from("team_join_forms").select("*").eq("slug", data.slug.toLowerCase()).maybeSingle();
    if (!formRow) throw new Error("This joining link is not valid");
    const form = formRow as Row;
    if (String(form['status']) !== "published") throw new Error("This team is not accepting applications right now");

    const teamId = String(form['team_id']);
    const { data: questions } = await admin
      .from("team_join_questions").select("*").eq("form_id", String(form['id'])).eq("is_active", true).order("sort_order", { ascending: true });

    const parsed = validateAnswers((questions ?? []) as Row[], data.answers as Record<string, unknown>, form['scoring_enabled'] === true);

    // ── global email uniqueness (server-side, cannot be bypassed from the browser) ──
    // 1. the address must not already belong to a team member of ANY team (team 1 vs team 2 isolation)
    const { data: memberClash } = await admin
      .from("team_members").select("id, team_id").ilike("email", parsed.email).limit(1).maybeSingle();
    if (memberClash) {
      throw new Error(
        String((memberClash as Row)['team_id']) === teamId
          ? "This email is already a member of this team — please sign in instead."
          : "This email is already registered as a team member on AD4YOU. Please use a different email address that has no AD4YOU account yet.",
      );
    }
    // 2. the address must not already be a registered AD4YOU account holder
    const { data: userClash } = await admin
      .from("users").select("id").ilike("email", parsed.email).limit(1).maybeSingle();
    if (userClash) {
      throw new Error("This email already has an AD4YOU account. Please apply with a different email address that has not created an AD4YOU account yet.");
    }



    if (form['allow_duplicates'] !== true) {
      const { data: dupe } = await admin
        .from("team_applications").select("id, status").eq("team_id", teamId).ilike("applicant_email", parsed.email)
        .in("status", ["pending", "under_review", "accepted"]).maybeSingle();
      if (dupe) {
        const status = String((dupe as Row)['status']);
        throw new Error(status === "accepted"
          ? "You have already been accepted into this team — please sign in instead."
          : "You already have an application under review for this team.");
      }
    }

    const request = getRequest();
    const ip = request?.headers.get("cf-connecting-ip") || request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

    // light spam guard: at most 3 submissions per IP per team per hour
    if (ip) {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await admin
        .from("team_applications").select("id", { count: "exact", head: true })
        .eq("team_id", teamId).eq("ip_hash", hashIp(ip)).gte("submitted_at", since);
      if (Number(count ?? 0) >= 3) throw new Error("Too many applications from this device. Please try again later.");
    }

    const { data: created, error } = await admin
      .from("team_applications")
      .insert({
        team_id: teamId,
        form_id: String(form['id']),
        applicant_name: parsed.name,
        applicant_email: parsed.email,
        applicant_phone: parsed.phone,
        country: parsed.country,
        city: parsed.city,
        answers: parsed.answers,
        score: parsed.score,
        score_max: parsed.scoreMax,
        status: "pending",
        ip_hash: hashIp(ip),
        user_agent: (request?.headers.get("user-agent") ?? "").slice(0, 300) || null,
      })
      .select("id")
      .single();
    throwIf(error);
    const id = String((created as Row)['id']);
    await logEvent(admin, id, teamId, "submitted", "Application submitted from the public joining form", "applicant");

    const { data: teamRow } = await admin.from("teams").select("*").eq("id", teamId).maybeSingle();
    const brand = await loadBrand(admin, (teamRow ?? {}) as Row);
    const { data: tplRow } = await admin.from("team_email_templates").select("*").eq("team_id", teamId).eq("kind", "received").maybeSingle();
    const tpl = (tplRow ?? null) as Row | null;
    if (!tpl || tpl['is_active'] !== false) {
      const vars = {
        applicant_name: parsed.name,
        team_name: brand.team_name,
        team_owner_name: brand.business_name,
        application_id: id,
        rejection_reason: "",
        contact_email: brand.contact_email,
        contact_phone: brand.contact_phone,
        whatsapp: brand.whatsapp,
        website: brand.website,
        login_link: `${origin()}/team-login`,
        account_setup_link: "",
      };
      await queueEmail(admin, {
        teamId, applicationId: id, kind: "received", to: parsed.email,
        subject: renderVars(String(tpl?.['subject'] ?? DEFAULT_TEMPLATES.received.subject), vars),
        bodyText: renderVars(String(tpl?.['body'] ?? DEFAULT_TEMPLATES.received.body), vars),
        brand,
      });
    }

    return { ok: true as const, message: String(form['success_message'] ?? "") };
  });

/* ═════════════════════════ public: secure member onboarding ════════════════ */

export const checkSetupToken = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token: z.string().trim().min(20).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const admin = getTeamAdmin();
    const { data: row } = await admin.from("member_setup_tokens").select("*").eq("token_hash", hashToken(data.token)).maybeSingle();
    const t = (row ?? null) as Row | null;
    if (!t || t['used_at'] || new Date(String(t['expires_at'])).getTime() < Date.now()) {
      return { valid: false as const };
    }
    const { data: member } = await admin.from("team_members").select("name, email, team_id").eq("id", String(t['member_id'])).maybeSingle();
    const { data: team } = await admin.from("teams").select("name").eq("id", String(t['team_id'])).maybeSingle();
    return {
      valid: true as const,
      name: String((member as Row | null)?.['name'] ?? ""),
      email: String((member as Row | null)?.['email'] ?? ""),
      teamName: String((team as Row | null)?.['name'] ?? ""),
    };
  });

export const completeMemberSetup = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ token: z.string().trim().min(20).max(200), password: z.string().min(8).max(72) }).parse(input),
  )
  .handler(async ({ data }) => {
    const admin = getTeamAdmin();
    const { data: row } = await admin.from("member_setup_tokens").select("*").eq("token_hash", hashToken(data.token)).maybeSingle();
    const t = (row ?? null) as Row | null;
    if (!t || t['used_at'] || new Date(String(t['expires_at'])).getTime() < Date.now()) {
      throw new Error("This setup link is no longer valid — ask your team owner for a new one");
    }
    const memberId = String(t['member_id']);
    const { error } = await admin
      .from("team_members")
      .update({ password_hash: hashMemberPassword(data.password), must_set_password: false, is_active: true })
      .eq("id", memberId);
    throwIf(error);
    await admin.from("member_setup_tokens").update({ used_at: new Date().toISOString() }).eq("id", String(t['id']));
    const { data: member } = await admin.from("team_members").select("email, application_id, team_id").eq("id", memberId).maybeSingle();
    const app = (member as Row | null)?.['application_id'];
    if (app) await logEvent(admin, String(app), String((member as Row)['team_id']), "password_set", "Team member completed account setup", "member");
    return { ok: true as const, email: String((member as Row | null)?.['email'] ?? "") };
  });
