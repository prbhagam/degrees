// Owner: Christian (Server & Infra)
// Netlify Background Function for asynchronous AI activity generation (runs up to 15 minutes).
import { generateActivity } from '../../src/ai/generateActivity.js';
import { activityInput, saveActivity } from '../../src/lib/groups.js';

export const handler = async (event: { httpMethod?: string; body?: string | null }) => {
  if (event.httpMethod && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { groupId, userId } = JSON.parse(event.body ?? '{}');
    if (!groupId || !userId) {
      console.warn('[activity-background] missing groupId or userId');
      return { statusCode: 400, body: 'Missing groupId or userId' };
    }
    const input = await activityInput(groupId, userId);
    const activity = await generateActivity(input);
    await saveActivity(groupId, activity, 'ready');
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (error) {
    console.error('[activity-background] failed:', error);
    return { statusCode: 500, body: String(error) };
  }
};
