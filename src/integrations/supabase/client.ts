// Hardcoded to the user's external Supabase project (sxaaamdvzajyanaxmecy).
// Lovable Cloud injects its own VITE_SUPABASE_* env vars at the process level which
// override .env, so env-based config is bypassed intentionally here.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = 'https://sxaaamdvzajyanaxmecy.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4YWFhbWR2emFqeWFuYXhtZWN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NzM3OTQsImV4cCI6MjA5NzM0OTc5NH0.8J96IhEm87yMHQ1OZdHQIJMjih0ub5K11Li8eGi0JZ0';

function createSupabaseClient() {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: typeof window !== 'undefined' ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
