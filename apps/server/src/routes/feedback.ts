// Owner: Christian (Server & Infra) — see docs/ROLES.md. Real-mode persistence rewritten by Sahith to match the
// schema (event_feedback + feedback_peers), which is what match_narrow reads for the meet-again boost.
import { Hono } from 'hono';
import {
  feedbackRequestSchema,
  type FeedbackRelationship,
  type FeedbackRequest,
  type FeedbackResponse,
} from '@degrees/shared';
import { analyzeFeedback } from '../ai/analyzeFeedback.js';
import { embedProfile } from '../ai/embedProfile.js';
import { env } from '../config/env.js';
import { getServiceClient } from '../db/supabase.js';
import { ApiError, validateJson } from '../lib/errors.js';
import { memberRows } from '../lib/groups.js';
import type { AppEnv } from '../middleware/auth.js';
import { DEMO_GROUP_ID } from '../mocks/fixtures.js';

// One answer per peer; if the client repeats someone, the last answer wins.
export function peerAnswers(
  peers: FeedbackRequest['peers'],
  authorId: string,
  groupmateIds: Set<string>,
): { peer_id: string; relationship: FeedbackRelationship }[] {
  const answers = new Map<string, FeedbackRelationship>();
  for (const { peerId, relationship } of peers) {
    if (peerId === authorId || !groupmateIds.has(peerId)) {
      throw new ApiError(
        400,
        'invalid_request',
        'peers must be other members of this group.',
      );
    }
    answers.set(peerId, relationship);
  }
  return [...answers].map(([peer_id, relationship]) => ({
    peer_id,
    relationship,
  }));
}

// Derived labels the profile doesn't already carry, compared case-insensitively against every tag kind.
export function newDerivedLabels(
  derived: string[],
  existing: string[],
): string[] {
  const have = new Set(existing.map((label) => label.trim().toLowerCase()));
  return derived.filter((label) => !have.has(label.toLowerCase()));
}

async function addDerivedTags(userId: string, labels: string[]): Promise<void> {
  const db = getServiceClient();
  const { data, error } = await db
    .from('profile_tags')
    .select('label')
    .eq('user_id', userId);
  if (error) {
    throw new Error(`profile_tags read failed: ${error.message}`);
  }
  const fresh = newDerivedLabels(
    labels,
    data.map((row) => row.label as string),
  );
  if (fresh.length === 0) return;
  const { error: insertError } = await db
    .from('profile_tags')
    .insert(
      fresh.map((label) => ({ user_id: userId, label, kind: 'derived' })),
    );
  if (insertError) {
    throw new Error(`profile_tags insert failed: ${insertError.message}`);
  }
}

export const feedbackRoutes = new Hono<AppEnv>().post(
  '/groups/:id/feedback',
  async (context) => {
    const groupId = context.req.param('id');
    const userId = context.get('userId');

    if (env.mockMode) {
      if (groupId !== DEMO_GROUP_ID) {
        throw new ApiError(
          404,
          'group_not_found',
          'The requested group does not exist.',
        );
      }
      const request = await validateJson(context, feedbackRequestSchema);
      const analysis = request.freeText
        ? await analyzeFeedback(request.freeText)
        : undefined;
      const response = {
        ok: true,
        derivedTags: analysis?.tags.map(({ label }) => label) ?? [],
      } satisfies FeedbackResponse;
      return context.json(response);
    }

    const request = await validateJson(context, feedbackRequestSchema);
    // Non-members get the same 404 as a missing group.
    const members = await memberRows(groupId, userId);
    const peers = peerAnswers(
      request.peers,
      userId,
      new Set(members.map(({ user_id }) => user_id)),
    );

    const freeText = request.freeText?.trim() || null;
    const analysis = freeText ? await analyzeFeedback(freeText) : undefined;
    const derivedTags = analysis?.tags.map(({ label }) => label) ?? [];

    const db = getServiceClient();
    // unique (group_id, author_id): resubmitting replaces the earlier answer, so a double tap is harmless.
    const { data: saved, error } = await db
      .from('event_feedback')
      .upsert(
        {
          group_id: groupId,
          author_id: userId,
          rating: request.rating,
          free_text: freeText,
          analyzed_tags: analysis ? derivedTags : null,
          sentiment: analysis?.sentiment ?? null,
        },
        { onConflict: 'group_id,author_id' },
      )
      .select('id')
      .single();
    if (error || !saved) {
      console.error('[feedback] event_feedback upsert failed:', error);
      throw new ApiError(500, 'save_failed', 'Failed to save feedback.');
    }

    // Upsert the new answers first, then prune peers left out of this submission: a failure in between leaves
    // an extra old answer rather than losing the new ones.
    const feedbackId = saved.id as string;
    if (peers.length > 0) {
      const { error: peersError } = await db
        .from('feedback_peers')
        .upsert(
          peers.map((peer) => ({ feedback_id: feedbackId, ...peer })),
          { onConflict: 'feedback_id,peer_id' },
        );
      if (peersError) {
        console.error('[feedback] feedback_peers upsert failed:', peersError);
        throw new ApiError(500, 'save_failed', 'Failed to save feedback.');
      }
    }
    let prune = db.from('feedback_peers').delete().eq('feedback_id', feedbackId);
    if (peers.length > 0) {
      prune = prune.not(
        'peer_id',
        'in',
        `(${peers.map(({ peer_id }) => peer_id).join(',')})`,
      );
    }
    const { error: pruneError } = await prune;
    if (pruneError) {
      console.error('[feedback] feedback_peers prune failed:', pruneError);
    }

    // The feedback is saved; tags and re-embedding improve the next match but must not fail this request.
    if (derivedTags.length > 0) {
      try {
        await addDerivedTags(userId, derivedTags);
        await embedProfile(userId);
      } catch (tagError) {
        console.error('[feedback] derived tags not applied:', tagError);
      }
    }

    const response = { ok: true, derivedTags } satisfies FeedbackResponse;
    return context.json(response);
  },
);
