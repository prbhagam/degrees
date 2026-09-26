// Owner: Christian (Server & Infra) — server owns every write; see docs/ROLES.md and AGENTS.md.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

let serviceClient: SupabaseClient | undefined;

export function getServiceClient(): SupabaseClient {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error(
      'Supabase service client requested without SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    );
  }
  serviceClient ??= createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serviceClient;
}
