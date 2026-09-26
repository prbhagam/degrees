// Owner: Sahith (Data & Matching) — seed shell only; see docs/ROLES.md.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const rootEnvPath = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

function getSeedClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Seeding requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function main(): Promise<void> {
  // TODO(Sahith): seed ~12 realistic profiles with embeddings; a graph with genuine second-degree
  // paths; two completed groups with submitted feedback; and one live-join event with a room code.
  void getSeedClient;
}

await main();
