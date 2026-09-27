// Owner: Christian (Server & Infra) — structured logging, added by Sahith (Sep 26, wave 2).
// One JSON line per event so Netlify's function logs (and a local terminal) can be grepped by route, user, or
// request id. `LOG_LEVEL` (debug | info | warn | error, default info) gates verbosity; production never logs
// request bodies. Every request gets an id that's echoed back in the `x-request-id` header, so a screenshot of
// an app error can be tied to a server line.
import { randomUUID } from 'node:crypto';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../middleware/auth.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function configuredLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? '').toLowerCase();
  return raw in LEVELS ? (raw as LogLevel) : 'info';
}
const threshold = LEVELS[configuredLevel()];

type Fields = Record<string, unknown>;

function serializeError(error: unknown): Fields {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      ...(process.env.NODE_ENV === 'production' ? {} : { stack: error.stack }),
    };
  }
  return { errorMessage: String(error) };
}

function emit(level: LogLevel, event: string, fields: Fields = {}): void {
  if (LEVELS[level] < threshold) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, fields?: Fields) => emit('debug', event, fields),
  info: (event: string, fields?: Fields) => emit('info', event, fields),
  warn: (event: string, fields?: Fields) => emit('warn', event, fields),
  error: (event: string, error?: unknown, fields?: Fields) =>
    emit('error', event, { ...fields, ...(error === undefined ? {} : serializeError(error)) }),
};

// Wraps a unit of work (a Gemini call, a matching stage, a Storage signing pass) with start/finish/fail lines and
// the elapsed time. The returned promise is the original one; failures are re-thrown after logging.
export async function timed<T>(
  event: string,
  fields: Fields,
  work: () => Promise<T>,
  isFailure?: (result: T) => boolean,
): Promise<T> {
  const started = Date.now();
  log.debug(`${event}.start`, fields);
  try {
    const result = await work();
    if (isFailure?.(result)) {
      log.warn(`${event}.failed`, { ...fields, ms: Date.now() - started });
    } else {
      log.info(`${event}.ok`, { ...fields, ms: Date.now() - started });
    }
    return result;
  } catch (error) {
    log.error(`${event}.fail`, error, { ...fields, ms: Date.now() - started });
    throw error;
  }
}

// Request/response line for every call: method, path, status, duration, the verified user (set by requireAuth
// later in the chain, so it's read after `next()`), and the request id.
export const requestLogger = createMiddleware<AppEnv>(async (context, next) => {
  const requestId = context.req.header('x-request-id') ?? randomUUID();
  context.set('requestId', requestId);
  context.header('x-request-id', requestId);
  const started = Date.now();
  await next();
  const status = context.res.status;
  const fields: Fields = {
    requestId,
    method: context.req.method,
    path: context.req.path,
    status,
    ms: Date.now() - started,
    userId: context.get('userId') ?? null,
  };
  if (status >= 500) log.error('http.request', undefined, fields);
  else if (status >= 400) log.warn('http.request', fields);
  else log.info('http.request', fields);
});
