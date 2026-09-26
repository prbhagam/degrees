// Owner: Pranav (Groups, Activities & Chat) — room-code join; Christian owns the server framework.
import { Hono } from 'hono';
import type { JoinEventResponse } from '@degrees/shared';
import { env } from '../config/env.js';
import { getServiceClient } from '../db/supabase.js';
import { ApiError } from '../lib/errors.js';
import { displayNames } from '../lib/graph.js';
import type { AppEnv } from '../middleware/auth.js';
import { DEMO_EVENT_CODE, eventFixture } from '../mocks/fixtures.js';

const mockEventJoins = new Set<string>();

const eventNotFound = () =>
  new ApiError(404, 'event_not_found', 'No event uses that room code.');

export const eventRoutes = new Hono<AppEnv>().post(
  '/events/:roomCode/join',
  async (context) => {
    // Room codes are case-insensitive for people typing them; they're stored uppercase.
    const roomCode = context.req.param('roomCode').trim().toUpperCase();
    const userId = context.get('userId');

    if (env.mockMode) {
      if (roomCode !== DEMO_EVENT_CODE) {
        throw eventNotFound();
      }
      mockEventJoins.add(`${eventFixture.eventId}:${userId}`);
      const response: JoinEventResponse = eventFixture;
      return context.json(response);
    }

    const db = getServiceClient();
    const { data: event, error } = await db
      .from('events')
      .select('id, name')
      .eq('room_code', roomCode)
      .maybeSingle();
    if (error) {
      throw new Error(`events read failed: ${error.message}`);
    }
    if (!event) {
      throw eventNotFound();
    }

    // Idempotent: scanning the same code twice keeps the original joined_at.
    const { error: joinError } = await db
      .from('event_attendees')
      .upsert(
        { event_id: event.id, user_id: userId },
        { onConflict: 'event_id,user_id', ignoreDuplicates: true },
      );
    if (joinError) {
      throw new Error(`event_attendees insert failed: ${joinError.message}`);
    }

    const { data: attendeeRows, error: attendeeError } = await db
      .from('event_attendees')
      .select('user_id')
      .eq('event_id', event.id)
      .order('joined_at', { ascending: false });
    if (attendeeError) {
      throw new Error(`event_attendees read failed: ${attendeeError.message}`);
    }
    const ids = attendeeRows.map((row) => row.user_id as string);
    const names = await displayNames(ids);
    const response = {
      eventId: event.id as string,
      name: (event.name as string | null) ?? roomCode,
      attendees: ids.map((id) => ({
        id,
        displayName: names.get(id) ?? 'Someone',
      })),
    } satisfies JoinEventResponse;
    return context.json(response);
  },
);
