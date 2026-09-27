// Owner: Pranav (Groups, Activities & Chat) — Added Sep 26 (wave 2, Sahith).
// CHANGED Sep 26 (wave 5, Sahith): each summary carries `lastMessage` and `chatOpen` for the Chats tab.
// CHANGED Sep 27 (wave 6): and `memberNames` / `unrevealedCount`, so an unnamed group is titled by who's in it.
// GET /api/hangouts: every group the viewer belongs to, matched and meetup alike, as one list for Home. Replaces
// the app's direct `group_members → groups` read, which couldn't see meetup names or room codes (RLS never
// exposed `events`) and had no way to show history.
import { Hono } from 'hono';
import type { GroupStatus, HangoutKind, HangoutsResponse, HangoutSummary } from '@degrees/shared';
import { env } from '../config/env.js';
import { getServiceClient } from '../db/supabase.js';
import { displayNames, exploreFrom, profileBasics } from '../lib/graph.js';
import { isCodeOpen, MEETUP_COLUMNS, redactReasoning, type MeetupRow } from '../lib/groups.js';
import type { AppEnv } from '../middleware/auth.js';
import { hangoutsFixture } from '../mocks/fixtures.js';
import { mockHostedEvents } from './events.js';

interface GroupRow {
  id: string;
  kind: HangoutKind | null;
  name: string | null;
  status: GroupStatus | null;
  reasoning: string | null;
  formed_at: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  created_by: string | null;
}

const iso = (value: string | null): string | null => (value ? new Date(value).toISOString() : null);

// "Past" = wrapped up, or a meetup whose scheduled time is more than a day gone without anyone ending it.
const STALE_MS = 24 * 60 * 60 * 1000;
export function isPastHangout(row: { status: GroupStatus; completedAt: string | null; scheduledAt: string | null }, now = Date.now()): boolean {
  if (row.status === 'completed' || row.completedAt) return true;
  return row.scheduledAt !== null && now - new Date(row.scheduledAt).getTime() > STALE_MS;
}

export const hangoutRoutes = new Hono<AppEnv>().get('/hangouts', async (context) => {
  if (env.mockMode) {
    // Hosted-in-this-process meetups show up next to the fixture group so the host flow is visible on Home.
    const hosted: HangoutSummary[] = [...mockHostedEvents.entries()].map(([roomCode, event]) => ({
      id: event.groupId,
      kind: 'meetup',
      name: event.name,
      status: 'confirmed',
      reasoning: '',
      memberCount: event.attendeeIds.length,
      formedAt: new Date().toISOString(),
      scheduledAt: event.scheduledAt,
      completedAt: null,
      roomCode,
      hostId: context.get('userId'),
      isPast: false,
      needsResponse: false,
      acceptedCount: event.attendeeIds.length,
      lastMessage: null,
      chatOpen: true,
      memberNames: [],
      unrevealedCount: 0,
      feedbackGiven: false,
    }));
    const response = { hangouts: [...hosted, ...hangoutsFixture.hangouts] } satisfies HangoutsResponse;
    return context.json(response);
  }

  const userId = context.get('userId');
  const db = getServiceClient();
  const { data: memberships, error } = await db
    .from('group_members')
    .select('group_id, accepted_at')
    .eq('user_id', userId);
  if (error) {
    throw new Error(`group_members read failed: ${error.message}`);
  }
  const groupIds = memberships.map((row) => row.group_id as string);
  const myAcceptance = new Map(memberships.map((row) => [row.group_id as string, row.accepted_at as string | null]));
  if (groupIds.length === 0) {
    const response = { hangouts: [] } satisfies HangoutsResponse;
    return context.json(response);
  }

  const [groups, counts, meetups, recent, feedback] = await Promise.all([
    db
      .from('groups')
      .select('id, kind, name, status, reasoning, formed_at, scheduled_at, completed_at, created_by')
      .in('id', groupIds),
    db.from('group_members').select('group_id, user_id, accepted_at').in('group_id', groupIds),
    db.from('events').select(MEETUP_COLUMNS).in('group_id', groupIds),
    // wave 5: newest messages across every group, newest first; the first row per group is its preview.
    db
      .from('messages')
      .select('group_id, sender_id, body, created_at')
      .in('group_id', groupIds)
      .order('created_at', { ascending: false })
      .limit(300),
    // wave 6: which of these the viewer has already left feedback on.
    db.from('event_feedback').select('group_id').eq('author_id', userId).in('group_id', groupIds),
  ]);
  if (groups.error) throw new Error(`groups read failed: ${groups.error.message}`);
  if (counts.error) throw new Error(`group_members read failed: ${counts.error.message}`);
  if (meetups.error) throw new Error(`events read failed: ${meetups.error.message}`);
  if (recent.error) throw new Error(`messages read failed: ${recent.error.message}`);
  if (feedback.error) throw new Error(`event_feedback read failed: ${feedback.error.message}`);
  const feedbackGiven = new Set(feedback.data.map((row) => row.group_id as string));
  const latestByGroup = new Map<string, { sender_id: string; body: string; created_at: string }>();
  for (const row of recent.data) {
    const id = row.group_id as string;
    if (!latestByGroup.has(id)) {
      latestByGroup.set(id, { sender_id: row.sender_id as string, body: row.body as string, created_at: row.created_at as string });
    }
  }
  const senderNames = await displayNames([...latestByGroup.values()].map((row) => row.sender_id));

  const memberCount = new Map<string, number>();
  const acceptedCount = new Map<string, number>();
  const memberIds = new Map<string, string[]>();
  for (const row of counts.data) {
    const id = row.group_id as string;
    memberCount.set(id, (memberCount.get(id) ?? 0) + 1);
    if (row.accepted_at) acceptedCount.set(id, (acceptedCount.get(id) ?? 0) + 1);
    memberIds.set(id, [...(memberIds.get(id) ?? []), row.user_id as string]);
  }
  // Wave 4: a proposed matched group's reasoning must not name anyone the viewer hasn't met (same rule as
  // GET /groups/:id). Everyone at 1st degree is revealed; anyone else's name is scrubbed.
  // Wave 6: the same rule decides which names title the group (memberNames), so basics are read for everyone.
  const proposedIds = (groups.data as GroupRow[])
    .filter((row) => (row.status ?? 'proposed') === 'proposed' && (row.kind ?? 'matched') === 'matched')
    .map((row) => row.id);
  const otherIds = [...new Set([...memberIds.values()].flat())].filter((id) => id !== userId);
  const [basics, { reach }] = await Promise.all([
    profileBasics(otherIds),
    proposedIds.length > 0 ? exploreFrom(userId, 1) : Promise.resolve({ reach: new Map() }),
  ]);
  const hiddenIdsByGroup = new Map<string, Set<string>>();
  const hiddenNamesByGroup = new Map<string, string[]>();
  for (const id of proposedIds) {
    const hidden = (memberIds.get(id) ?? []).filter((memberId) => memberId !== userId && !reach.has(memberId));
    hiddenIdsByGroup.set(id, new Set(hidden));
    hiddenNamesByGroup.set(
      id,
      hidden.flatMap((memberId) => {
        const name = basics.get(memberId)?.displayName;
        return name ? [name] : [];
      }),
    );
  }
  const meetupByGroup = new Map(
    (meetups.data as MeetupRow[]).map((row) => [row.group_id as string, row]),
  );

  const hangouts = (groups.data as GroupRow[]).map((row): HangoutSummary => {
    const meetup = meetupByGroup.get(row.id) ?? null;
    const status = row.status ?? 'proposed';
    const scheduledAt = iso(row.scheduled_at ?? meetup?.scheduled_at ?? null);
    const completedAt = iso(row.completed_at ?? meetup?.ended_at ?? null);
    const kind = row.kind ?? (meetup ? 'meetup' : 'matched');
    const chatOpen = kind === 'meetup' || status !== 'proposed';
    const latest = latestByGroup.get(row.id);
    const others = (memberIds.get(row.id) ?? []).filter((id) => id !== userId);
    const hidden = hiddenIdsByGroup.get(row.id);
    return {
      id: row.id,
      kind,
      name: row.name ?? meetup?.name ?? null,
      status,
      reasoning: redactReasoning(row.reasoning ?? '', hiddenNamesByGroup.get(row.id) ?? []),
      memberCount: memberCount.get(row.id) ?? 0,
      formedAt: iso(row.formed_at),
      scheduledAt,
      completedAt,
      roomCode: meetup && isCodeOpen(meetup) ? meetup.room_code : null,
      hostId: row.created_by ?? meetup?.created_by ?? null,
      isPast: isPastHangout({ status, completedAt, scheduledAt }),
      needsResponse: kind === 'matched' && status === 'proposed' && !myAcceptance.get(row.id),
      acceptedCount: acceptedCount.get(row.id) ?? 0,
      lastMessage: latest
        ? {
            body: latest.body,
            // Chat is closed while a matched group is proposed, so a still-redacted sender can't be named.
            senderName: chatOpen ? (senderNames.get(latest.sender_id) ?? 'Someone') : 'Someone',
            createdAt: new Date(latest.created_at).toISOString(),
          }
        : null,
      chatOpen,
      memberNames: others.filter((id) => !hidden?.has(id)).map((id) => basics.get(id)?.displayName ?? 'Someone'),
      unrevealedCount: others.filter((id) => hidden?.has(id)).length,
      feedbackGiven: feedbackGiven.has(row.id),
    };
  });

  // Active first: scheduled ones soonest-first, then unscheduled ones newest-first. Past ones newest-first.
  const recency = (h: HangoutSummary) => h.completedAt ?? h.scheduledAt ?? h.formedAt ?? '';
  hangouts.sort((a, b) => {
    if (a.isPast !== b.isPast) return a.isPast ? 1 : -1;
    if (a.isPast) return recency(b).localeCompare(recency(a));
    if (a.scheduledAt && b.scheduledAt) return a.scheduledAt.localeCompare(b.scheduledAt);
    if (a.scheduledAt || b.scheduledAt) return a.scheduledAt ? -1 : 1;
    return (b.formedAt ?? '').localeCompare(a.formedAt ?? '');
  });

  const response = { hangouts } satisfies HangoutsResponse;
  return context.json(response);
});
