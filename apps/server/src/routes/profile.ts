// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import { Hono } from 'hono';
import { updateProfileRequestSchema, type OkResponse } from '@degrees/shared';
import { embedProfile } from '../ai/embedProfile.js';
import { env } from '../config/env.js';
import { getServiceClient } from '../db/supabase.js';
import { ApiError, validateJson } from '../lib/errors.js';
import type { AppEnv } from '../middleware/auth.js';

export const profileRoutes = new Hono<AppEnv>().put(
  '/profile',
  async (context) => {
    const body = await validateJson(context, updateProfileRequestSchema);
    const userId = context.get('userId');

    if (!env.mockMode) {
      const supabase = getServiceClient();

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          display_name: body.displayName,
          bio: body.bio,
          ai_paragraph: body.aiParagraph,
          city: body.city,
          phone: body.phone,
          pronouns: body.pronouns ?? null,
          photo_url: body.photoUrl ?? null,
        })
        .eq('id', userId);

      if (profileError) {
        throw new ApiError(500, 'update_failed', 'Failed to update profile.');
      }

      // Derived tags come from feedback and are server-owned: a profile edit replaces only the tags the user picks,
      // otherwise saving the profile would erase what feedback taught the matcher (Sahith).
      await supabase
        .from('profile_tags')
        .delete()
        .eq('user_id', userId)
        .neq('kind', 'derived');

      const chosen = body.tags.filter((tag) => tag.kind !== 'derived');
      if (chosen.length > 0) {
        const rows = chosen.map((tag) => ({
          user_id: userId,
          label: tag.label,
          kind: tag.kind,
        }));
        const { error: tagsError } = await supabase
          .from('profile_tags')
          .insert(rows);
        if (tagsError) {
          console.error('Failed to update tags:', tagsError);
        }
      }
    }

    await embedProfile(userId);
    const response = { ok: true } satisfies OkResponse;
    return context.json(response);
  },
);
