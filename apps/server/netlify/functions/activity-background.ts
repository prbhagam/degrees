// Owner: Christian (Server & Infra)
// Netlify Background Function for asynchronous AI activity generation (runs up to 15 minutes). Invoked by
// POST /api/groups/:id/activity (routes/groups.ts) with { groupId, userId }; Netlify answers the caller 202 at once.
//
// CHANGED Sep 26 (wave 2 merge): modern Request/Response API with a default export, like api.ts. The legacy
// `export const handler` form made Netlify emit a CommonJS shim that `require()`d this file, which fails at init
// because apps/server/package.json is "type": "module" (ERR_REQUIRE_ESM in the Sep 26 deploy logs).
import { generateActivity } from '../../src/ai/generateActivity.js';
import { activityInput, saveActivity } from '../../src/lib/groups.js';
import { log, timed } from '../../src/lib/log.js';

interface BackgroundPayload {
  groupId?: string;
  userId?: string;
}

export default async function activityBackground(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  let payload: BackgroundPayload = {};
  try {
    payload = (await request.json()) as BackgroundPayload;
  } catch {
    // Falls through to the missing-fields check below.
  }
  const { groupId, userId } = payload;
  if (!groupId || !userId) {
    log.warn('activity.background.bad_request', { groupId: groupId ?? null, userId: userId ?? null });
    return new Response('Missing groupId or userId', { status: 400 });
  }
  try {
    const input = await activityInput(groupId, userId);
    const activity = await timed('ai.activity', { groupId }, () => generateActivity(input));
    await saveActivity(groupId, activity, 'ready');
    log.info('activity.background.saved', { groupId, userId, source: activity.source });
    return Response.json({ ok: true });
  } catch (error) {
    log.error('activity.background.failed', error, { groupId, userId });
    return new Response(String(error), { status: 500 });
  }
}
