// Owner: Christian (Server & Infra)
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ApiErrorBody, OkResponse } from '@degrees/shared';
import { env } from './config/env.js';
import { ApiError, errorBody } from './lib/errors.js';
import { log, requestLogger } from './lib/log.js';
import { requireAuth, type AppEnv } from './middleware/auth.js';
import { authRoutes } from './routes/auth.js';
import { connectionRoutes } from './routes/connections.js';
import { eventRoutes } from './routes/events.js';
import { feedbackRoutes } from './routes/feedback.js';
import { groupRoutes } from './routes/groups.js';
import { hangoutRoutes } from './routes/hangouts.js';
import { matchRoutes } from './routes/match.js';
import { meRoutes } from './routes/me.js';
import { messageRoutes } from './routes/messages.js';
import { notificationRoutes } from './routes/notifications.js';
import { preferencesRoutes } from './routes/preferences.js';
import { profileRoutes } from './routes/profile.js';

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  // Added Sep 26 (wave 2): one structured line per request (see lib/log.ts). Registered first so it times the
  // whole chain, including auth and error handling.
  app.use('*', requestLogger);
  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      exposeHeaders: ['Content-Length'],
      maxAge: 86400,
    }),
  );

  app.get('/health', (context) => {
    const response = { ok: true } satisfies OkResponse;
    return context.json(response);
  });

  // Public routes first: a matched handler that returns ends the chain, so requireAuth below never runs for them.
  app.route('/api', authRoutes);

  const api = new Hono<AppEnv>();
  api.use('*', requireAuth);
  api.route('/', meRoutes);
  api.route('/', profileRoutes);
  api.route('/', preferencesRoutes);
  api.route('/', connectionRoutes);
  api.route('/', eventRoutes);
  api.route('/', matchRoutes);
  api.route('/', groupRoutes);
  api.route('/', hangoutRoutes);
  api.route('/', messageRoutes);
  api.route('/', feedbackRoutes);
  api.route('/', notificationRoutes);
  app.route('/api', api);

  app.notFound((context) => {
    const response: ApiErrorBody = errorBody('not_found', 'Route not found.');
    return context.json(response, 404);
  });

  app.onError((error, context) => {
    if (error instanceof ApiError) {
      // Expected failures (404s, 409s, validation) are logged at warn by requestLogger's status line; only the
      // code is worth a debug line here.
      log.debug('http.api_error', {
        requestId: context.get('requestId'),
        code: error.code,
        status: error.status,
      });
      const response: ApiErrorBody = errorBody(error.code, error.message);
      return context.json(response, error.status);
    }
    log.error('http.unhandled', error, {
      requestId: context.get('requestId'),
      path: context.req.path,
    });
    const message =
      env.nodeEnv === 'production'
        ? 'An unexpected error occurred.'
        : error.message;
    const response: ApiErrorBody = errorBody('internal_error', message);
    return context.json(response, 500);
  });

  return app;
}

export const app = createApp();
