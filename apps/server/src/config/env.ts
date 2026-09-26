// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const rootEnvPath = fileURLToPath(new URL('../../../../.env', import.meta.url));
if (existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

const rawSchema = z.object({
  NODE_ENV: z.preprocess(emptyToUndefined, z.string().optional()),
  PORT: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().optional(),
  ),
  MOCK_MODE: z.preprocess(emptyToUndefined, z.string().optional()),
  SUPABASE_URL: z.preprocess(emptyToUndefined, z.url().optional()),
  SUPABASE_SERVICE_ROLE_KEY: z.preprocess(
    emptyToUndefined,
    z.string().optional(),
  ),
  GEMINI_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  GOOGLE_MAPS_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  TICKETMASTER_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  RESEND_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
});

const parsed = rawSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment: ${z.prettifyError(parsed.error)}`);
}

const rawMockMode = parsed.data.MOCK_MODE?.toLowerCase();
let mockMode: boolean;
if (rawMockMode === undefined) {
  mockMode = parsed.data.NODE_ENV !== 'production';
} else if (rawMockMode === 'true' || rawMockMode === '1') {
  mockMode = true;
} else if (rawMockMode === 'false' || rawMockMode === '0') {
  mockMode = false;
} else {
  throw new Error(
    'Invalid environment: MOCK_MODE must be true, false, 1, or 0.',
  );
}

if (parsed.data.NODE_ENV === 'production' && mockMode) {
  throw new Error(
    'Invalid environment: MOCK_MODE=true is refused in production.',
  );
}

if (!mockMode) {
  const required = [
    ['SUPABASE_URL', parsed.data.SUPABASE_URL],
    ['SUPABASE_SERVICE_ROLE_KEY', parsed.data.SUPABASE_SERVICE_ROLE_KEY],
    ['GEMINI_API_KEY', parsed.data.GEMINI_API_KEY],
  ].filter(([, value]) => value === undefined);
  if (required.length > 0) {
    throw new Error(
      `Missing required environment variables: ${required.map(([name]) => name).join(', ')}`,
    );
  }
}

export const env = {
  nodeEnv: parsed.data.NODE_ENV ?? 'development',
  port: parsed.data.PORT ?? 8787,
  mockMode,
  supabaseUrl: parsed.data.SUPABASE_URL,
  supabaseServiceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
  geminiApiKey: parsed.data.GEMINI_API_KEY,
  googleMapsApiKey: parsed.data.GOOGLE_MAPS_API_KEY,
  ticketmasterApiKey: parsed.data.TICKETMASTER_API_KEY,
  resendApiKey: parsed.data.RESEND_API_KEY,
} as const;
