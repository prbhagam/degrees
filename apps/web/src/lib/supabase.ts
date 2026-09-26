// Owner: shared web scaffold (Charles) — anon-key Supabase client is READS ONLY; all writes go through the API.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | undefined;

export function isSupabaseEnvironmentUnset(): boolean {
  return !(
    import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_ANON_KEY
  );
}

export function getSupabaseClient(): SupabaseClient {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Supabase reads require VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    );
  }
  client ??= createClient(url, anonKey);
  return client;
}
