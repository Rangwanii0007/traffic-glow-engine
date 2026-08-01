import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export const referralCodePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const planFieldsSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers or dashes").max(40).optional(),
  description: z.string().trim().max(400).nullable().optional(),
  price: z.number().min(0).max(100000).optional(),
  duration_days: z.number().int().min(0).max(3650).optional(),
  is_free: z.boolean().nullable().optional(),
  is_active: z.boolean().nullable().optional(),
  is_popular: z.boolean().nullable().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
});

export function getAppAdmin() {
  const url = process.env['EXTERNAL_SUPABASE_URL'] || process.env['SUPABASE_URL'];
  const key = process.env['EXTERNAL_SUPABASE_SERVICE_ROLE_KEY'] || process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) throw new Error("Backend is not configured");
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export async function requireUser() {
  const request = getRequest();
  const authHeader = request?.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Not signed in");
  const token = authHeader.slice("Bearer ".length).trim();
  const admin = getAppAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("Not signed in");
  return { user: data.user, admin };
}

export async function requireAdmin() {
  const { user, admin } = await requireUser();
  const { data } = await admin.from("users").select("role").eq("id", user.id).maybeSingle();
  if ((data as { role?: string } | null)?.role !== "admin") throw new Error("Admin access required");
  return { user, admin };
}