// Owner: Pranav (Groups, Activities & Chat) — room-code join; Christian owns the server framework.
// CHANGED Sep 26 (wave 2, Sahith): a meetup is a kind='meetup' group. Hosting creates the `events` row (room
// code) AND its backing group; joining adds a group_members row (plus the legacy event_attendees row). Codes
// expire 24h after the scheduled time (or creation), and close when the meetup is ended
// (POST /groups/:id/complete). The lobby now says who you've already met.
import { Hono } from 'hono';
import {
  createEventRequestSchema,
  type CreateEventResponse,
  type JoinEventResponse,
} from '@degrees/shared';
import { env } from '../config/env.js';
import { getServiceClient } from '../db/supabase.js';
import { ApiError, validateJson } from '../lib/errors.js';
import { exploreFrom, profileBasics } from '../lib/graph.js';
import { isCodeOpen, MEETUP_COLUMNS, type MeetupRow } from '../lib/groups.js';
import { log } from '../lib/log.js';
import type { AppEnv } from '../middleware/auth.js';
import {
  DEMO_EVENT_CODE,
  DEMO_GROUP_ID,
  eventFixture,
  meFixture,
  people,
  REQUESTER_ID,
} from '../mocks/fixtures.js';

const CODE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

// Mock-mode registry of hosted meetups (real mode persists to `events` + `groups`).
interface MockEvent {
  eventId: string;
  groupId: string;
  name: string;
  scheduledAt: string | null;
  codeExpiresAt: string;
  attendeeIds: string[];
}
export const mockHostedEvents = new Map<string, MockEvent>();
const mockEventJoins = new Set<string>();

const eventNotFound = () =>
  new ApiError(404, 'event_not_found', 'No event uses that room code.');
const codeExpired = () =>
  new ApiError(410, 'event_code_expired', 'That code has expired. Ask the host for a new meetup.');

// 6 chars, no ambiguous 0/O/1/I — read out loud at a table full of strangers.
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

function codeExpiry(scheduledAt: string | undefined, now = Date.now()): string {
  const base = scheduledAt ? Math.max(new Date(scheduledAt).getTime(), now) : now;
  return new Date(base + CODE_TTL_MS).toISOString();
}

export const eventRoutes = new Hono<AppEnv>()
  .post('/events', async (context) => {
    const request = await validateJson(context, createEventRequestSchema);
    const userId = context.get('userId');

    if (env.mockMode) {
      const roomCode = generateRoomCode();
      const eventId = `mock-event-${roomCode}`;
      mockHostedEvents.set(roomCode, {
        eventId,
        groupId: DEMO_GROUP_ID,
        name: request.name,
        scheduledAt: request.scheduledAt ?? null,
        codeExpiresAt: codeExpiry(request.scheduledAt),
        attendeeIds: [userId],
      });
      const response = { eventId, roomCode } satisfies CreateEventResponse;
      return context.json(response);
    }

    const db = getServiceClient();
    // The backing group first: it's what chat, plans, photos, and the home list hang off.
    const { data: group, error: groupError } = await db
      .from('groups')
      .insert({
        kind: 'meetup',
        name: request.name,
        created_by: userId,
        scheduled_at: request.scheduledAt ?? null,
        status: 'confirmed',
      })
      .select('id')
      .single();
    if (groupError || !group) {
      log.error('events.create.group_failed', groupError, { userId });
      throw new ApiError(500, 'save_failed', 'Failed to create the meetup.');
    }
    const groupId = group.id as string;

    // Room codes are unique; retry on the (rare) collision instead of failing the host.
    let created: { id: string; room_code: string } | null = null;
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS && !created; attempt++) {
      const roomCode = generateRoomCode();
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
          group_id: groupId,
          code_expires_at: codeExpiry(request.scheduledAt),
        })
        .select('id, room_code')
        .single();
      if (error?.code === '23505') continue;
      if (error || !data) {
        log.error('events.create.event_failed', error, { userId, groupId });
        throw new ApiError(500, 'save_failed', 'Failed to create the meetup.');
      }
      created = data as { id: string; room_code: string };
    }
    if (!created) {
      throw new ApiError(500, 'save_failed', 'Could not allocate a room code. Try again.');
    }

    // The host is in their own meetup from the start.
    const { error: memberError } = await db
      .from('group_members')
      .upsert({ group_id: groupId, user_id: userId, degree: 0, accepted_at: new Date().toISOString() }, { onConflict: 'group_id,user_id', ignoreDuplicates: true });
    if (memberError) {
      throw new Error(`group_members insert failed: ${memberError.message}`);
    }
    const { error: attendeeError } = await db
      .from('event_attendees')
      .upsert({ event_id: created.id, user_id: userId }, { onConflict: 'event_id,user_id', ignoreDuplicates: true });
    if (attendeeError) {
      throw new Error(`event_attendees insert failed: ${attendeeError.message}`);
    }

    log.info('events.created', { userId, groupId, eventId: created.id, scheduledAt: request.scheduledAt ?? null });
    const response = { eventId: created.id, roomCode: created.room_code } satisfies CreateEventResponse;
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
      const hosted = mockHostedEvents.get(roomCode);
      if (!hosted) {
        throw eventNotFound();
      }
      if (new Date(hosted.codeExpiresAt).getTime() <= Date.now()) {
        throw codeExpired();
      }
      if (!hosted.attendeeIds.includes(userId)) {
        hosted.attendeeIds.push(userId);
      }
      const response: JoinEventResponse = {
        eventId: hosted.eventId,
        groupId: hosted.groupId,
        name: hosted.name,
        hostId: REQUESTER_ID,
        scheduledAt: hosted.scheduledAt,
        codeExpiresAt: hosted.codeExpiresAt,
        endedAt: null,
        // Mock mode has exactly one real identity (meFixture) to draw from, so borrow the fixture people for
        // the rest of the room.
        attendees: hosted.attendeeIds.map((id, index) => ({
          id,
          displayName: index === 0 ? meFixture.displayName : (people[index]?.displayName ?? 'Someone'),
          bio: index === 0 ? meFixture.bio : (people[index]?.bio ?? null),
          photoUrl: meFixture.photoUrl,
          alreadyMet: false,
        })),
      };
      return context.json(response);
    }

    const db = getServiceClient();
    const { data: eventRow, error } = await db
      .from('events')
      .select(MEETUP_COLUMNS)
      .eq('room_code', roomCode)
      .maybeSingle();
    if (error) {
      throw new Error(`events read failed: ${error.message}`);
    }
    const event = (eventRow as MeetupRow | null) ?? null;
    if (!event) {
      throw eventNotFound();
    }
    if (!event.group_id) {
      // Every event gets a backing group from migration 0007 onward; an orphan means the migration didn't run.
      log.error('events.join.no_group', undefined, { eventId: event.id });
      throw new ApiError(500, 'event_not_ready', 'This meetup is missing its group. Ask the host to recreate it.');
    }
    const groupId = event.group_id;

    // Already a member (the host, or a re-scan) can always re-open the lobby; new joins need an open code.
    const { data: existing, error: existingError } = await db
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle();
    if (existingError) {
      throw new Error(`group_members read failed: ${existingError.message}`);
    }
    if (!existing) {
      if (!isCodeOpen(event)) {
        throw codeExpired();
      }
      const { error: memberError } = await db
        .from('group_members')
        .upsert({ group_id: groupId, user_id: userId, degree: null, accepted_at: new Date().toISOString() }, { onConflict: 'group_id,user_id', ignoreDuplicates: true });
      if (memberError) {
        throw new Error(`group_members insert failed: ${memberError.message}`);
      }
      log.info('events.joined', { userId, groupId, eventId: event.id });
    }
    // Idempotent: scanning the same code twice keeps the original joined_at.
    const { error: joinError } = await db
      .from('event_attendees')
      .upsert({ event_id: event.id, user_id: userId }, { onConflict: 'event_id,user_id', ignoreDuplicates: true });
    if (joinError) {
      throw new Error(`event_attendees insert failed: ${joinError.message}`);
    }

    const { data: memberRowsData, error: membersError } = await db
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId);
    if (membersError) {
      throw new Error(`group_members read failed: ${membersError.message}`);
    }
    const ids = memberRowsData.map((row) => row.user_id as string);

    // The lobby shows real name/bio/photo for everyone at the event, not gated on the connections graph
    // (Charles: "when joining event, all members should be able to see name, bio, pfp"). It does NOT form an
    // edge by itself: that's the explicit "We met" per attendee, or ending the meetup (which connects everyone
    // who was there — team decision, Sep 26 wave 2). `alreadyMet` is a 1st-degree edge with the viewer.
    const [basics, { reach }] = await Promise.all([profileBasics(ids), exploreFrom(userId, 1, ids)]);
    const response = {
      eventId: event.id,
      groupId,
      name: event.name ?? roomCode,
      hostId: event.created_by,
      scheduledAt: event.scheduled_at ? new Date(event.scheduled_at).toISOString() : null,
      codeExpiresAt: isCodeOpen(event) && event.code_expires_at ? new Date(event.code_expires_at).toISOString() : null,
      endedAt: event.ended_at ? new Date(event.ended_at).toISOString() : null,
      attendees: ids.map((id) => ({
        id,
        displayName: basics.get(id)?.displayName ?? 'Someone',
        bio: basics.get(id)?.bio ?? null,
        photoUrl: basics.get(id)?.photoUrl ?? null,
        alreadyMet: reach.get(id)?.degree === 1,
      })),
    } satisfies JoinEventResponse;
    return context.json(response);
  });
