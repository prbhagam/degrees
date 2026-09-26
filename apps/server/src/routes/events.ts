// Owner: Pranav (Groups, Activities & Chat) — room-code join; Christian owns the server framework.
import { Hono } from 'hono';
import {
  createEventRequestSchema,
  type CreateEventResponse,
  type JoinEventResponse,
} from '@degrees/shared';
import { env } from '../config/env.js';
import { getServiceClient } from '../db/supabase.js';
import { ApiError, validateJson } from '../lib/errors.js';
import { profileBasics } from '../lib/graph.js';
import type { AppEnv } from '../middleware/auth.js';
import { DEMO_EVENT_CODE, eventFixture, meFixture } from '../mocks/fixtures.js';

const mockEventJoins = new Set<string>();

// CHANGED Sep 26: host-created events (POST /events) previously only returned a roomCode — nothing
// registered it anywhere in mock mode, so joining that code immediately 404'd with "No event uses
// that room code", a completely broken host flow. This is the mock-mode event registry; real mode
// already persists to the `events` table.
interface MockEvent {
  eventId: string;
  name: string;
  attendeeIds: string[];
}
const mockHostedEvents = new Map<string, MockEvent>();

const eventNotFound = () =>
  new ApiError(404, 'event_not_found', 'No event uses that room code.');

// 6 chars, no ambiguous 0/O/1/I — read out loud at a table full of strangers.
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export const eventRoutes = new Hono<AppEnv>()
  .post('/events', async (context) => {
    const request = await validateJson(context, createEventRequestSchema);
    const userId = context.get('userId');
    const roomCode = generateRoomCode();

    if (env.mockMode) {
      const eventId = `mock-event-${roomCode}`;
      mockHostedEvents.set(roomCode, { eventId, name: request.name, attendeeIds: [] });
      const response = {
        eventId,
        roomCode,
      } satisfies CreateEventResponse;
      return context.json(response);
    }

    const db = getServiceClient();
    const { data, error } = await db
      .from('events')
      .insert({
        room_code: roomCode,
        name: request.name,
        description: request.description ?? null,
        scheduled_at: request.scheduledAt ?? null,
        city: request.city ?? null,
        group_size_min: request.groupSizeMin,
        group_size_max: request.groupSizeMax,
        created_by: userId,
      })
      .select('id')
      .single();
    if (error || !data) {
      throw new ApiError(500, 'save_failed', 'Failed to create the event.');
    }
    const response = {
      eventId: data.id as string,
      roomCode,
    } satisfies CreateEventResponse;
    return context.json(response);
  })
  .post('/events/:roomCode/join', async (context) => {
    // Room codes are case-insensitive for people typing them; they're stored uppercase.
    const roomCode = context.req.param('roomCode').trim().toUpperCase();
    const userId = context.get('userId');

    if (env.mockMode) {
      if (roomCode === DEMO_EVENT_CODE) {
        mockEventJoins.add(`${eventFixture.eventId}:${userId}`);
        const response: JoinEventResponse = eventFixture;
        return context.json(response);
      }
      // A host-created event (POST /events, above) — previously unregistered anywhere, so joining
      // it 404'd immediately.
      const hosted = mockHostedEvents.get(roomCode);
      if (!hosted) {
        throw eventNotFound();
      }
      if (!hosted.attendeeIds.includes(userId)) {
        hosted.attendeeIds.push(userId);
      }
      const response: JoinEventResponse = {
        eventId: hosted.eventId,
        name: hosted.name,
        // Mock mode has exactly one real identity (meFixture) to draw from.
        attendees: hosted.attendeeIds.map((id) => ({
          id,
          displayName: meFixture.displayName,
          bio: meFixture.bio,
          photoUrl: meFixture.photoUrl,
        })),
      };
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

    // CHANGED Sep 26: the lobby shows real name/bio/photo for everyone at the event, not gated on
    // the connections graph — Charles: "when joining event, all members should be able to see
    // name, bio, pfp." This does NOT auto-form a connection edge: that stays the explicit "We met"
    // action per attendee (JoinRoomScreen), which is the actual, deliberate in-person confirmation
    // Circle's degree math depends on. Being listed in the lobby just means you're both here now.
    const basics = await profileBasics(ids);
    const response = {
      eventId: event.id as string,
      name: (event.name as string | null) ?? roomCode,
      attendees: ids.map((id) => ({
        id,
        displayName: basics.get(id)?.displayName ?? 'Someone',
        bio: basics.get(id)?.bio ?? null,
        photoUrl: basics.get(id)?.photoUrl ?? null,
      })),
    } satisfies JoinEventResponse;
    return context.json(response);
  });
