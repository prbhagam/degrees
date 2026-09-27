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

// Added Sep 26 — server-side signup. CHANGED Sep 27: people sign up and log in with their real email, which is the
// Supabase auth email as-is. The username stays as the @handle shown in the app, not a login.
// `degrees.demo` is reserved for the seeded demo accounts, so `supabase/scripts/purge_demo_users.sql` can remove
// every one of them (and nothing else) with a single domain match. Signup refuses it.
export const DEMO_EMAIL_DOMAIN = 'degrees.demo';

export function isDemoEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`);
}

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address.'));

export const signupEmailSchema = emailSchema.refine(
  (email) => !isDemoEmail(email),
  `@${DEMO_EMAIL_DOMAIN} addresses are reserved for demo accounts.`,
);

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9._]{3,20}$/,
    'Usernames are 3–20 characters: lowercase letters, numbers, dots, or underscores.',
  );

// ---- Phone numbers (Added Sep 26, wave 2): US only for now ------------------------------------
// Stored as E.164 (+1XXXXXXXXXX); shown as (404) 555-0148. Both apps format with these so the server never
// sees a half-typed string and the app never shows a raw one.
export function normalizeUsPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  const national =
    digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  // NANP: area code and exchange can't start with 0 or 1.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(national)) return null;
  return `+1${national}`;
}

export function formatUsPhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  const national =
    digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits.slice(0, 10);
  const area = national.slice(0, 3);
  const exchange = national.slice(3, 6);
  const line = national.slice(6, 10);
  if (national.length === 0) return '';
  if (national.length < 4) return `(${area}`;
  if (national.length < 7) return `(${area}) ${exchange}`;
  return `(${area}) ${exchange}-${line}`;
}

export const usPhoneSchema = z
  .string()
  .trim()
  .transform((value, context) => {
    const normalized = normalizeUsPhone(value);
    if (!normalized) {
      context.addIssue({
        code: 'custom',
        message: 'Enter a 10-digit US phone number.',
      });
      return z.NEVER;
    }
    return normalized;
  });

export const signupRequestSchema = z.object({
  email: signupEmailSchema,
  username: usernameSchema,
  password: z.string().min(8, 'Passwords need at least 8 characters.'),
  displayName: z.string().trim().min(1, 'Add your name.'),
  phone: usPhoneSchema,
  pronouns: z.string().trim().optional(),
});

export const updateProfileRequestSchema = z.object({
  displayName: z.string(),
  bio: z.string(),
  aiParagraph: z.string(),
  city: z.string(),
  // CHANGED Sep 26: onboarding now collects these at signup / edit-profile. Wave 2: normalized to E.164 when
  // present; '' is allowed for accounts created before phone was collected.
  phone: z.union([z.literal(''), usPhoneSchema]),
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

export const activityStatusSchema = z.enum(['generating', 'ready', 'failed']);

export const activitySchema = z.object({
  // Added Sep 26 (wave 3): set on saved plans so the app can list plan history and pick one to reuse. Absent on a
  // plan the model has just produced and on the mock fixture.
  id: z.string().optional(),
  createdAt: z.iso.datetime().optional(),
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
  status: activityStatusSchema.optional(),
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

// Added Sep 26 (wave 4): any member can rename a group or meetup (PUT /api/groups/:id).
export const renameGroupRequestSchema = z.object({
  name: z.string().trim().min(1, 'Give it a name.').max(60, 'Keep it under 60 characters.'),
});

// Added Sep 26 (wave 3): bring a previous plan back as the current one (see GroupResponse.activityHistory).
export const restoreActivityRequestSchema = z.object({
  activityId: z.string().min(1),
});

// ---- Added Sep 26 (wave 2): meetups as groups, leave, icebreakers ---------------------------
export const hangoutKindSchema = z.enum(['matched', 'meetup']);

export const generateIcebreakersOutputSchema = z.object({
  icebreakers: z.array(z.string().trim().min(1)).min(3).max(8),
});

export const notificationTypeSchema = z.enum([
  'hangout_invited',
  'hangout_forming',
  'message_received',
  'feedback_prompt',
  'exchange_requested',
  'exchange_accepted',
  'connection_added',
  // Added Sep 26 (wave 5): something about a meetup or group you're in changed — renamed, a time was locked in,
  // the plan changed, or it ended. payload.change says which.
  'event_changed',
]);

// ---- Added Sep 26 (wave 5): notification settings --------------------------------------------
// One toggle per kind of notification the server actually writes. Stored as profiles.notification_settings
// (jsonb); a missing key means on. message_received and feedback_prompt have no writer yet, so no toggle.
export const notificationSettingsSchema = z.object({
  // hangout_invited (added to a new group) + hangout_forming (everyone said yes)
  hangouts: z.boolean(),
  // exchange_requested + exchange_accepted
  exchange: z.boolean(),
  // connection_added (someone tapped "We met", or a meetup ended and connected you)
  met: z.boolean(),
  // event_changed (rename, time locked in, new plan, ended)
  changes: z.boolean(),
});
export const updateNotificationSettingsRequestSchema = notificationSettingsSchema.partial();
export const DEFAULT_NOTIFICATION_SETTINGS = {
  hangouts: true,
  exchange: true,
  met: true,
  changes: true,
} as const satisfies z.infer<typeof notificationSettingsSchema>;
// Which toggle governs each type; null = always delivered (nothing writes these today anyway).
export const NOTIFICATION_SETTING_FOR = {
  hangout_invited: 'hangouts',
  hangout_forming: 'hangouts',
  message_received: null,
  feedback_prompt: null,
  exchange_requested: 'exchange',
  exchange_accepted: 'exchange',
  connection_added: 'met',
  event_changed: 'changes',
} as const satisfies Record<z.infer<typeof notificationTypeSchema>, keyof z.infer<typeof notificationSettingsSchema> | null>;

// ---- Added Sep 26 (wave 5): when a plan happens -------------------------------------------------
// The calendar moved off "Host a meetup" (you're already with those people) onto the generated plan: members
// propose times, say which they're free for, and any member locks one in (groups.scheduled_at).
export const proposeTimeRequestSchema = z.object({
  startsAt: z.iso.datetime(),
  note: z.string().trim().max(120).optional(),
});
export const timeVoteRequestSchema = z.object({
  available: z.boolean(),
});

// ---- Added Sep 26 (wave 3): contact exchange between 1st-degree connections (Your Circle) ----
// Same mutual-consent rule as the per-group exchange, keyed on the connection pair instead of a group, so the
// state survives leaving the group and shows wherever the person appears.
export const contactExchangeRequestSchema = z.object({
  peerId: z.uuid(),
});
