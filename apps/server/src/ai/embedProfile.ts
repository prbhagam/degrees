// Owner: Christian (Server & Infra) — see docs/ROLES.md.
// Strict variant and shared text template added by Sahith for the seed re-embed (supabase/seed/seed.ts).
import { env } from '../config/env.js';
import { getServiceClient } from '../db/supabase.js';
import { EMBEDDING_DIMS, EMBEDDING_MODEL, getAiClient } from './client.js';

interface EmbeddableProfile {
  bio: string | null;
  ai_paragraph: string | null;
}

// Every vector we compare must come from this same template, model, task type, and dimension.
// Interests lead because they're what matching is about. Name and city are left out on purpose: a name says nothing
// about interests, everyone shares a city (distance is filtered separately), and shared boilerplate only pushes
// every pair's similarity toward the same value.
export function buildProfileEmbeddingText(
  profile: EmbeddableProfile,
  tags: string[],
): string {
  return [
    tags.length > 0 ? `Interests: ${tags.join(', ')}` : '',
    profile.bio ? `About: ${profile.bio}` : '',
    profile.ai_paragraph ? `In their words: ${profile.ai_paragraph}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// Throws on any failure so callers that must know (the seed) can report it.
export async function embedProfileStrict(
  userId: string,
): Promise<{ dims: number }> {
  const supabase = getServiceClient();

  const [profileResult, tagsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('bio, ai_paragraph')
      .eq('id', userId)
      .single(),
    supabase.from('profile_tags').select('label').eq('user_id', userId),
  ]);

  if (profileResult.error || !profileResult.data) {
    throw new Error(
      `Failed to fetch profile: ${profileResult.error?.message ?? 'not found'}`,
    );
  }
  if (tagsResult.error) {
    throw new Error(`Failed to fetch tags: ${tagsResult.error.message}`);
  }

  const tags = [...new Set(tagsResult.data.map((t) => t.label as string))];
  const contentToEmbed = buildProfileEmbeddingText(
    profileResult.data as EmbeddableProfile,
    tags,
  );
  if (!contentToEmbed) {
    throw new Error('Profile has nothing to embed yet.');
  }

  const response = await getAiClient().models.embedContent({
    model: EMBEDDING_MODEL,
    contents: contentToEmbed,
    config: {
      outputDimensionality: EMBEDDING_DIMS,
      // Profile-vs-profile comparison is symmetric, which is what SEMANTIC_SIMILARITY is tuned for.
      taskType: 'SEMANTIC_SIMILARITY',
    },
  });

  const values = response.embeddings?.[0]?.values;
  if (!values || values.length !== EMBEDDING_DIMS) {
    throw new Error(
      `Expected a ${EMBEDDING_DIMS}-dim embedding, got ${values?.length ?? 0}.`,
    );
  }

  const { error: upsertError } = await supabase
    .from('profile_embeddings')
    .upsert({
      user_id: userId,
      embedding: JSON.stringify(values),
      updated_at: new Date().toISOString(),
    });
  if (upsertError) {
    throw new Error(`Failed to upsert embedding: ${upsertError.message}`);
  }

  return { dims: values.length };
}

export async function embedProfile(userId: string): Promise<void> {
  if (env.mockMode) {
    return;
  }

  try {
    await embedProfileStrict(userId);
  } catch (error) {
    console.error(`Failed to generate embedding for user ${userId}:`, error);
  }
}
