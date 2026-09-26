// Owner: Christian (Server & Infra)
// Netlify Background Function for asynchronous AI activity generation (runs up to 15 minutes).
import { generateActivity } from '../../src/ai/generateActivity.js';
import { activityInput, saveActivity } from '../../src/lib/groups.js';
import { log, timed } from '../../src/lib/log.js';

export const handler = async (event: { httpMethod?: string; body?: string | null }) => {
  if (event.httpMethod && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { groupId, userId } = JSON.parse(event.body ?? '{}');
    if (!groupId || !userId) {
      log.warn('activity.background.bad_request', { groupId, userId });
      return { statusCode: 400, body: 'Missing groupId or userId' };
    }
    const input = await activityInput(groupId, userId);
    const activity = await timed('ai.activity', { groupId }, () => generateActivity(input));
    await saveActivity(groupId, activity, 'ready');
    log.info('activity.background.saved', { groupId, userId, source: activity.source });
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (error) {
    log.error('activity.background.failed', error);
    return { statusCode: 500, body: String(error) };
  }
};
