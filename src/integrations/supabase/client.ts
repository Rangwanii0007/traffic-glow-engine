import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://sxaaamdvzajyanaxmecy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_j1HUPCHSc1EXubEI5reGJg_sYEAChJy";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

export const SUPABASE_PROJECT_URL = SUPABASE_URL;
