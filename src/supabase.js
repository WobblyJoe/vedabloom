
import { createClient } from "@supabase/supabase-js";

// Read Supabase credentials from your Vite environment variables.
const supabaseUrl = (
  import.meta.env.VITE_SUPABASE_URL ?? ""
).trim();

const supabaseAnonKey = (
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? ""
).trim();

// Check whether both required credentials are available.
export const hasSupabaseConfig = Boolean(
  supabaseUrl && supabaseAnonKey
);

// Create the Supabase client only when configured.
// Without credentials, VedaBloom can still run in local demo mode.
export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
