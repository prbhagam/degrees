// Owner: Christian (Server & Infra) — tsx is intentionally a runtime dependency because start executes TypeScript source.
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import type { ApiErrorBody, OkResponse } from '@degrees/shared';
import { env } from './config/env.js';
import { ApiError, errorBody } from './lib/errors.js';
import { requireAuth, type AppEnv } from './middleware/auth.js';
import { connectionRoutes } from './routes/connections.js';
import { eventRoutes } from './routes/events.js';
import { feedbackRoutes } from './routes/feedback.js';
import { groupRoutes } from './routes/groups.js';
import { matchRoutes } from './routes/match.js';
import { meRoutes } from './routes/me.js';
import { messageRoutes } from './routes/messages.js';
import { preferencesRoutes } from './routes/preferences.js';
import { profileRoutes } from './routes/profile.js';

const app = new Hono<AppEnv>();

app.get('/health', (context) => {
  const response = { ok: true } satisfies OkResponse;
  return context.json(response);
});

const api = new Hono<AppEnv>();
api.use('*', requireAuth);
api.route('/', meRoutes);
api.route('/', profileRoutes);
api.route('/', preferencesRoutes);
api.route('/', connectionRoutes);
api.route('/', eventRoutes);
api.route('/', matchRoutes);
api.route('/', groupRoutes);
api.route('/', messageRoutes);
api.route('/', feedbackRoutes);
app.route('/api', api);

app.notFound((context) => {
  const response: ApiErrorBody = errorBody('not_found', 'Route not found.');
  return context.json(response, 404);
});

app.onError((error, context) => {
  if (error instanceof ApiError) {
    const response: ApiErrorBody = errorBody(error.code, error.message);
    return context.json(response, error.status);
  }
  console.error(error);
  const message =
    env.nodeEnv === 'production'
      ? 'An unexpected error occurred.'
      : error.message;
  const response: ApiErrorBody = errorBody('internal_error', message);
  return context.json(response, 500);
});

console.log(
  `Degrees API starting on :${env.port} (${env.mockMode ? 'mock' : 'real'} mode)`,
);
serve({ fetch: app.fetch, port: env.port });
