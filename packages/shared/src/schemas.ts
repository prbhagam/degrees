// Contract made real: both apps import this; changing it is a four-person conversation (docs/API-CONTRACTS.md).
import { z } from 'zod';

export const tagKindSchema = z.enum(['hobby', 'activity', 'derived', 'avoid']);
// CHANGED Sep 26: added biweekly + few_times_week — validated onboarding design offered more granularity
// than daily/weekly/monthly. Still stored-and-shown-in-copy only per PRD §9 — no scheduler.
export const frequencySchema = z.enum([
  'daily',
  'few_times_week',
  'weekly',
  'biweekly',
  'monthly',
]);
export const feedbackRelationshipSchema = z.enum([
  'great',
  'fine',
  'not_for_me',
]);
export const connectionContextSchema = z.enum([
  'qr',
  'event',
  'group',
  'manual',
]);
export const activitySourceSchema = z.enum(['maps', 'ticketmaster']);
export const sentimentSchema = z.enum(['positive', 'neutral', 'negative']);

// Added Sep 26 — server-side signup. Supabase Auth runs on email + password; people sign in with a username,
// which maps to `<username>@degrees.demo` (PRD rule 9, and how the seeded demo logins work).
export const AUTH_EMAIL_DOMAIN = 'degrees.demo';

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9._]{3,20}$/,
    'Usernames are 3–20 characters: lowercase letters, numbers, dots, or underscores.',
  );

// A username becomes its auth email; anything already containing "@" is used as-is (older accounts).
export function authEmailFor(usernameOrEmail: string): string {
  const value = usernameOrEmail.trim().toLowerCase();
  return value.includes('@') ? value : `${value}@${AUTH_EMAIL_DOMAIN}`;
}

export const signupRequestSchema = z.object({
  username: usernameSchema,
  password: z.string().min(8, 'Passwords need at least 8 characters.'),
  displayName: z.string().trim().min(1, 'Add your name.'),
  phone: z.string().trim().min(7, 'Add a phone number.'),
  pronouns: z.string().trim().optional(),
});

export const updateProfileRequestSchema = z.object({
  displayName: z.string(),
  bio: z.string(),
  aiParagraph: z.string(),
  city: z.string(),
  // CHANGED Sep 26: onboarding now collects these at signup / edit-profile.
  phone: z.string(),
  pronouns: z.string().optional(),
  photoUrl: z.url().optional(),
  tags: z.array(
    z.object({
      label: z.string(),
      kind: tagKindSchema,
    }),
  ),
});

export const updatePreferencesRequestSchema = z.object({
  costMinCents: z.number().int(),
  costMaxCents: z.number().int(),
  maxTravelMi: z.number().int(),
  frequency: frequencySchema,
  groupSizeMin: z.number().int(),
  groupSizeMax: z.number().int(),
  maxDegrees: z.number().int(),
});

export const createConnectionRequestSchema = z.object({
  peerId: z.uuid(),
  context: connectionContextSchema,
  eventId: z.uuid().optional(),
});

export const sendMessageRequestSchema = z.object({
  body: z.string().trim().min(1),
});

export const feedbackRequestSchema = z.object({
  rating: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  // CHANGED Sep 26: wouldMeetAgain (boolean) replaced by a 3-way relationship signal —
  // richer input for future matching, and the hook for mutual contact exchange.
  peers: z.array(
    z.object({
      peerId: z.string(),
      relationship: feedbackRelationshipSchema,
    }),
  ),
  freeText: z.string().optional(),
});

export const activitySchema = z.object({
  title: z.string(),
  venue: z.string(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
  priceCents: z.number().int().nullable(),
  startsAt: z.iso.datetime().nullable(),
  source: activitySourceSchema,
  sourceUrl: z.string().nullable(),
  reasoning: z.string(),
});

export const analyzeFeedbackOutputSchema = z.object({
  tags: z.array(
    z.object({
      label: z.string(),
      kind: z.literal('derived'),
    }),
  ),
  sentiment: sentimentSchema,
});

// ---- Added Sep 26: host-created events, contact exchange, photos, notifications ------------

export const createEventRequestSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  scheduledAt: z.iso.datetime().optional(),
  city: z.string().optional(),
  groupSizeMin: z.number().int(),
  groupSizeMax: z.number().int(),
});

export const exchangeRequestSchema = z.object({
  peerId: z.uuid(),
});

// Added Sep 26 (Pranav): POST /groups/:id/photos had no request schema. The client uploads to
// Storage first, then posts the object path; the server never takes image bytes.
export const addPhotoRequestSchema = z.object({
  storagePath: z.string().trim().min(1).max(512),
});

// A proposed group ('status: proposed') needs a real way to say no — previously there was none.
export const respondRequestSchema = z.object({
  accept: z.boolean(),
});

export const notificationTypeSchema = z.enum([
  'hangout_invited',
  'hangout_forming',
  'message_received',
  'feedback_prompt',
  'exchange_requested',
  'exchange_accepted',
  'connection_added',
]);
