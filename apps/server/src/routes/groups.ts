// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import { Hono } from 'hono';
import type {
  Activity,
  GenerateActivityInput,
  GroupMember,
  GroupResponse,
} from '@degrees/shared';
import { generateActivity } from '../ai/generateActivity.js';
import { env } from '../config/env.js';
import { getServiceClient } from '../db/supabase.js';
import { ApiError } from '../lib/errors.js';
import type { AppEnv } from '../middleware/auth.js';
import { DEMO_GROUP_ID, groupFixture, people } from '../mocks/fixtures.js';

function assertKnownGroup(groupId: string): void {
  if (groupId !== DEMO_GROUP_ID) {
    throw new ApiError(
      404,
      'group_not_found',
      'The requested group does not exist.',
    );
  }
}

export const groupRoutes = new Hono<AppEnv>()
  .get('/groups/:id', async (context) => {
    const groupId = context.req.param('id');

    if (env.mockMode) {
      assertKnownGroup(groupId);
      const response: GroupResponse = groupFixture;
      return context.json(response);
    }

    const supabase = getServiceClient();

    const [groupResult, membersResult, activityResult] = await Promise.all([
      supabase
        .from('groups')
        .select('id, status, reasoning')
        .eq('id', groupId)
        .maybeSingle(),
      supabase
        .from('group_members')
        .select('user_id, degree, profiles(id, display_name)')
        .eq('group_id', groupId),
      supabase
        .from('activities')
        .select('*')
        .eq('group_id', groupId)
        .maybeSingle(),
    ]);

    if (groupResult.error || !groupResult.data) {
      throw new ApiError(
        404,
        'group_not_found',
        'The requested group does not exist.',
      );
    }

    const group = groupResult.data;
    const memberUserIds = (membersResult.data ?? []).map((m) => m.user_id);

    const { data: memberTags } = await supabase
      .from('profile_tags')
      .select('user_id, label')
      .in('user_id', memberUserIds);

    const tagsByUser = new Map<string, string[]>();
    (memberTags ?? []).forEach((t) => {
      const existing = tagsByUser.get(t.user_id) ?? [];
      existing.push(t.label);
      tagsByUser.set(t.user_id, existing);
    });

    const members: GroupMember[] = (membersResult.data ?? []).map((row) => {
      const profile = row.profiles as unknown as {
        id: string;
        display_name: string | null;
      } | null;
      return {
        id: profile?.id ?? row.user_id,
        displayName: profile?.display_name ?? 'Anonymous',
        degree: row.degree ?? 1,
        sharedInterests: tagsByUser.get(row.user_id) ?? [],
      };
    });

    let activity: Activity | null = null;
    if (activityResult.data) {
      const a = activityResult.data;
      activity = {
        title: a.title ?? '',
        venue: a.venue ?? '',
        address: a.address ?? '',
        lat: a.lat ?? 0,
        lng: a.lng ?? 0,
        priceCents: a.price_cents ?? null,
        startsAt: a.starts_at ?? null,
        source: a.source === 'ticketmaster' ? 'ticketmaster' : 'maps',
        sourceUrl: a.source_url ?? null,
        reasoning: a.reasoning ?? '',
      };
    }

    const response: GroupResponse = {
      id: group.id,
      status: (group.status as 'proposed' | 'confirmed' | 'completed') ?? 'proposed',
      reasoning: group.reasoning ?? '',
      members,
      activity,
    };

    return context.json(response);
  })
  .post('/groups/:id/activity', async (context) => {
    const groupId = context.req.param('id');

    if (env.mockMode) {
      assertKnownGroup(groupId);
      const input = {
        members: people.slice(0, 4).map(({ displayName, interests }) => ({
          displayName,
          interests: [...interests],
        })),
        constraints: {
          maxCostCents: 3500,
          maxTravelMi: 8,
          city: 'Atlanta',
          lat: 33.7756,
          lng: -84.3963,
        },
      } satisfies GenerateActivityInput;
      const response: Activity = await generateActivity(input);
      return context.json(response);
    }

    const supabase = getServiceClient();

    const { data: membersData, error: membersError } = await supabase
      .from('group_members')
      .select('user_id, profiles(display_name)')
      .eq('group_id', groupId);

    if (membersError || !membersData || membersData.length === 0) {
      throw new ApiError(
        404,
        'group_not_found',
        'The requested group does not exist or has no members.',
      );
    }

    const memberIds = membersData.map((m) => m.user_id);
    const { data: tagsData } = await supabase
      .from('profile_tags')
      .select('user_id, label')
      .in('user_id', memberIds);

    const tagsByUser = new Map<string, string[]>();
    (tagsData ?? []).forEach((t) => {
      const existing = tagsByUser.get(t.user_id) ?? [];
      existing.push(t.label);
      tagsByUser.set(t.user_id, existing);
    });

    const members = membersData.map((m) => {
      const profile = m.profiles as unknown as { display_name: string | null } | null;
      return {
        displayName: profile?.display_name ?? 'Anonymous',
        interests: tagsByUser.get(m.user_id) ?? [],
      };
    });

    const input: GenerateActivityInput = {
      members,
      constraints: {
        maxCostCents: 3500,
        maxTravelMi: 10,
        city: 'Atlanta',
        lat: 33.7756,
        lng: -84.3963,
      },
    };

    const activity = await generateActivity(input);

    await supabase.from('activities').upsert(
      {
        group_id: groupId,
        title: activity.title,
        venue: activity.venue,
        address: activity.address,
        lat: activity.lat,
        lng: activity.lng,
        price_cents: activity.priceCents,
        starts_at: activity.startsAt,
        source: activity.source,
        source_url: activity.sourceUrl,
        reasoning: activity.reasoning,
      },
      { onConflict: 'group_id' },
    );

    return context.json(activity);
  });
