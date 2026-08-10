import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAppAdmin, requireAdmin } from "./account.server";

export type PlanArticle = {
  id: string;
  plan_slug: string;
  emoji: string | null;
  title: string;
  subtitle: string | null;
  hero_image_url: string | null;
  content: string;
  is_published: boolean;
  sort_order: number;
  updated_at: string | null;
};

type Loose = {
  from: (t: string) => {
    select: (c: string) => {
      order: (c: string, o?: { ascending?: boolean }) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
    upsert: (v: unknown, o?: unknown) => Promise<{ error: { message: string } | null }>;
    delete: () => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> };
  };
};

/** Public: package detail articles shown on the pricing page. */
export const listPlanArticles = createServerFn({ method: "GET" }).handler(async (): Promise<PlanArticle[]> => {
  const admin = getAppAdmin() as unknown as Loose;
  const { data, error } = await admin.from("plan_articles").select("*").order("sort_order", { ascending: true });
  if (error) return [];
  return ((data ?? []) as PlanArticle[]).filter((a) => a.is_published !== false);
});

export const adminListPlanArticles = createServerFn({ method: "GET" }).handler(async (): Promise<PlanArticle[]> => {
  await requireAdmin();
  const admin = getAppAdmin() as unknown as Loose;
  const { data, error } = await admin.from("plan_articles").select("*").order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PlanArticle[];
});

const articleSchema = z.object({
  plan_slug: z.string().trim().regex(/^[a-z0-9-]+$/).max(40),
  emoji: z.string().trim().max(8).nullable().optional(),
  title: z.string().trim().min(2).max(160),
  subtitle: z.string().trim().max(300).nullable().optional(),
  hero_image_url: z.string().trim().url().max(500).nullable().optional().or(z.literal("")),
  content: z.string().max(60000),
  is_published: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(999).optional(),
});

export const adminSavePlanArticle = createServerFn({ method: "POST" })
  .inputValidator((input) => articleSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await requireAdmin();
    const admin = getAppAdmin() as unknown as Loose;
    const { error } = await admin.from("plan_articles").upsert(
      {
        plan_slug: data.plan_slug,
        emoji: data.emoji || null,
        title: data.title,
        subtitle: data.subtitle || null,
        hero_image_url: data.hero_image_url || null,
        content: data.content,
        is_published: data.is_published ?? true,
        sort_order: data.sort_order ?? 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "plan_slug" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeletePlanArticle = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await requireAdmin();
    const admin = getAppAdmin() as unknown as Loose;
    const { error } = await admin.from("plan_articles").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
