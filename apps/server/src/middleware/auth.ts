// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import { createMiddleware } from 'hono/factory';
import { env } from '../config/env.js';
import { getServiceClient } from '../db/supabase.js';
import { ApiError } from '../lib/errors.js';
import { REQUESTER_ID } from '../mocks/fixtures.js';

export interface AppEnv {
  Variables: {
    userId: string;
  };
}

export const requireAuth = createMiddleware<AppEnv>(async (context, next) => {
  const authorization = context.req.header('Authorization');
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  if (!match?.[1]) {
    throw new ApiError(401, 'unauthorized', 'A Bearer token is required.');
  }

  if (env.mockMode) {
    // userId always comes from the verified-token boundary, never a request body.
    context.set('userId', REQUESTER_ID);
    await next();
    return;
  }

  const { data, error } = await getServiceClient().auth.getUser(match[1]);
  if (error || !data.user) {
    throw new ApiError(401, 'unauthorized', 'The access token is invalid.');
  }
  context.set('userId', data.user.id);
  await next();
});
