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
  SUPABASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  SUPABASE_SERVICE_ROLE_KEY: z.preprocess(
    emptyToUndefined,
    z.string().optional(),
  ),
  GEMINI_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  GEMINI_RPM: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().optional(),
  ),
  // Netlify Background Functions need a Pro-or-higher plan; the team's account is legacy, so the default is the
  // inline path (generation inside the request, within generateActivity's 9s budget). Set true on a plan that
  // has them to answer instantly with a 'generating' placeholder instead.
  ACTIVITY_BACKGROUND: z.preprocess(emptyToUndefined, z.string().optional()),
  GOOGLE_MAPS_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  TICKETMASTER_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  RESEND_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
});

export function getEnv() {
  const parsed = rawSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(parsed.error)}`);
  }

  const rawMockMode = (parsed.data.MOCK_MODE ?? process.env.MOCK_MODE)?.toLowerCase();
  let mockMode: boolean;
  if (rawMockMode === undefined) {
    mockMode = (parsed.data.NODE_ENV ?? process.env.NODE_ENV) !== 'production';
  } else if (rawMockMode === 'true' || rawMockMode === '1') {
    mockMode = true;
  } else if (rawMockMode === 'false' || rawMockMode === '0') {
    mockMode = false;
  } else {
    throw new Error(
      'Invalid environment: MOCK_MODE must be true, false, 1, or 0.',
    );
  }

  const nodeEnv = parsed.data.NODE_ENV ?? process.env.NODE_ENV ?? 'development';

  if (nodeEnv === 'production' && mockMode) {
    throw new Error(
      'Invalid environment: MOCK_MODE=true is refused in production.',
    );
  }

  const supabaseUrl = parsed.data.SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseServiceRoleKey =
    parsed.data.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  const geminiApiKey = parsed.data.GEMINI_API_KEY ?? process.env.GEMINI_API_KEY;

  if (!mockMode) {
    const required = [
      ['SUPABASE_URL', supabaseUrl],
      ['SUPABASE_SERVICE_ROLE_KEY', supabaseServiceRoleKey],
      ['GEMINI_API_KEY', geminiApiKey],
    ].filter(([, value]) => value === undefined);
    if (required.length > 0) {
      throw new Error(
        `Missing required environment variables: ${required.map(([name]) => name).join(', ')}`,
      );
    }
  }

  return {
    nodeEnv,
    port: parsed.data.PORT ?? (process.env.PORT ? Number(process.env.PORT) : 8787),
    mockMode,
    supabaseUrl,
    supabaseServiceRoleKey,
    geminiApiKey,
    geminiRpm: parsed.data.GEMINI_RPM ?? (process.env.GEMINI_RPM ? Number(process.env.GEMINI_RPM) : 15),
    activityBackground: ['true', '1'].includes(
      (parsed.data.ACTIVITY_BACKGROUND ?? process.env.ACTIVITY_BACKGROUND ?? '').toLowerCase(),
    ),
    googleMapsApiKey:
      parsed.data.GOOGLE_MAPS_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY,
    ticketmasterApiKey:
      parsed.data.TICKETMASTER_API_KEY ?? process.env.TICKETMASTER_API_KEY,
    resendApiKey: parsed.data.RESEND_API_KEY ?? process.env.RESEND_API_KEY,
  } as const;
}

export const env = getEnv();
