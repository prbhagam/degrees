// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import { env } from '../config/env.js';
import { getServiceClient } from '../db/supabase.js';
import { EMBEDDING_DIMS, EMBEDDING_MODEL, getAiClient } from './client.js';

export async function embedProfile(userId: string): Promise<void> {
  if (env.mockMode) {
    return;
  }

  const supabase = getServiceClient();

  const [profileResult, tagsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name, bio, ai_paragraph, city')
      .eq('id', userId)
      .single(),
    supabase.from('profile_tags').select('label, kind').eq('user_id', userId),
  ]);

  if (profileResult.error || !profileResult.data) {
    console.error(`Failed to fetch profile for user ${userId}:`, profileResult.error);
    return;
  }

  const profile = profileResult.data;
  const tags = (tagsResult.data ?? []).map((t) => t.label).join(', ');

  const contentToEmbed = [
    `Name: ${profile.display_name ?? ''}`,
    `City: ${profile.city ?? ''}`,
    `Bio: ${profile.bio ?? ''}`,
    `Interests and Tags: ${tags}`,
    `About Me: ${profile.ai_paragraph ?? ''}`,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const ai = getAiClient();
    const response = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: contentToEmbed,
      config: {
        outputDimensionality: EMBEDDING_DIMS,
      },
    });

    const values = response.embeddings?.[0]?.values;
    if (!values || values.length === 0) {
      console.warn(`Empty embedding returned for user ${userId}`);
      return;
    }

    const { error: upsertError } = await supabase
      .from('profile_embeddings')
      .upsert({
        user_id: userId,
        embedding: JSON.stringify(values),
        updated_at: new Date().toISOString(),
      });

    if (upsertError) {
      console.error(`Failed to upsert embedding for user ${userId}:`, upsertError);
    }
  } catch (error) {
    console.error(`Failed to generate embedding for user ${userId}:`, error);
  }
}
