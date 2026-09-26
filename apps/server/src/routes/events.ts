// Owner: Christian (Server & Infra) — see docs/ROLES.md.
import { Hono } from 'hono';
import type { JoinEventResponse } from '@degrees/shared';
import { env } from '../config/env.js';
import { getServiceClient } from '../db/supabase.js';
import { ApiError } from '../lib/errors.js';
import type { AppEnv } from '../middleware/auth.js';
import { DEMO_EVENT_CODE, eventFixture } from '../mocks/fixtures.js';

export const eventRoutes = new Hono<AppEnv>().post(
  '/events/:roomCode/join',
  async (context) => {
    const roomCode = context.req.param('roomCode').trim().toUpperCase();
    const userId = context.get('userId');

    if (env.mockMode) {
      if (roomCode !== DEMO_EVENT_CODE) {
        throw new ApiError(
          404,
          'event_not_found',
          'No event uses that room code.',
        );
      }
      const response: JoinEventResponse = eventFixture;
      return context.json(response);
    }

    const supabase = getServiceClient();

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, name')
      .eq('room_code', roomCode)
      .maybeSingle();

    if (eventError || !event) {
      throw new ApiError(
        404,
        'event_not_found',
        'No event uses that room code.',
      );
    }

    await supabase.from('event_attendees').upsert(
      {
        event_id: event.id,
        user_id: userId,
      },
      { onConflict: 'event_id,user_id' },
    );

    const { data: attendeesData } = await supabase
      .from('event_attendees')
      .select('user_id, profiles(id, display_name)')
      .eq('event_id', event.id);

    const attendees = (attendeesData ?? [])
      .map((row) => {
        const profile = row.profiles as unknown as {
          id: string;
          display_name: string | null;
        } | null;
        return {
          id: profile?.id ?? row.user_id,
          displayName: profile?.display_name ?? 'Anonymous',
        };
      })
      .filter((a) => a.id !== userId);

    const connectionRows = attendees.map((peer) => {
      const [userA, userB] = [userId, peer.id].sort();
      return {
        user_a: userA,
        user_b: userB,
        met_context: 'event' as const,
        event_id: event.id,
      };
    });

    if (connectionRows.length > 0) {
      await supabase
        .from('connections')
        .upsert(connectionRows, { onConflict: 'user_a,user_b' });
    }

    const response: JoinEventResponse = {
      eventId: event.id,
      name: event.name ?? 'Event',
      attendees,
    };

    return context.json(response);
  },
);
