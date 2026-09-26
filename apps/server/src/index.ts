// Owner: Christian (Server & Infra) — tsx is intentionally a runtime dependency because start executes TypeScript source.
import { serve } from '@hono/node-server';
import { app } from './app.js';
import { env } from './config/env.js';

console.log(
  `Degrees API starting on :${env.port} (${env.mockMode ? 'mock' : 'real'} mode)`,
);

serve({ fetch: app.fetch, port: env.port });
