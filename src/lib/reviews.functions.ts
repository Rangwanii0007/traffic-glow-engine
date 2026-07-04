import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

type SafeReview = {
  id: string;
  user_id: string | null;
  external_user_id: string | null;
  reviewer_name: string | null;
  reviewer_email: string | null;
  rating: number;
  message: string;
  created_at: string;
  users: { full_name: string | null; email: string; avatar_url: string | null } | null;
};

function getManagedAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Backend is not configured");
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

function getAuthVerifier() {
  const url = process.env.EXTERNAL_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.EXTERNAL_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Auth backend is not configured");
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

async function getSignedInUser() {
  const request = getRequest();
  const authHeader = request?.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Not signed in");
  const token = authHeader.slice("Bearer ".length).trim();
  const verifier = getAuthVerifier();
  const { data, error } = await verifier.auth.getUser(token);
  if (error || !data.user) throw new Error("Not signed in");
  return data.user;
}

export const getCommunityReviews = createServerFn({ method: "GET" }).handler(async (): Promise<SafeReview[]> => {
  const admin = getManagedAdmin();
  const { data, error } = await admin
    .from("reviews")
    .select("id, user_id, external_user_id, reviewer_name, reviewer_email, rating, message, created_at, users:user_id(full_name, email, avatar_url)")
    .eq("is_approved", true)
    .order("rating", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SafeReview[];
});

export const submitCommunityReview = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        rating: z.number().int().min(1).max(5),
        message: z.string().trim().min(5).max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const authUser = await getSignedInUser();
    const admin = getManagedAdmin();
    const email = authUser.email ?? `${authUser.id}@user.local`;
    const fullName =
      typeof authUser.user_metadata?.full_name === "string"
        ? authUser.user_metadata.full_name
        : email.split("@")[0];

    const payload = {
      external_user_id: authUser.id,
      reviewer_name: fullName,
      reviewer_email: email,
      rating: data.rating,
      message: data.message,
      is_approved: true,
    } as never;

    const { error } = await admin.from("reviews").upsert(
      payload,
      { onConflict: "external_user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });