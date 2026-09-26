// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { z } from 'zod';
import type { ApiErrorBody } from '@degrees/shared';

export class ApiError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const errorBody = (code: string, message: string): ApiErrorBody => ({
  error: { code, message },
});

export async function validateJson<T>(
  context: Context,
  schema: z.ZodType<T>,
): Promise<T> {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    throw new ApiError(
      400,
      'invalid_request',
      'Request body must be valid JSON.',
    );
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; ');
    throw new ApiError(400, 'invalid_request', message);
  }
  return result.data;
}
