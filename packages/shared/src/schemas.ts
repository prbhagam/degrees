// Contract made real: both apps import this; changing it is a four-person conversation (docs/API-CONTRACTS.md).
import { z } from 'zod';

export const tagKindSchema = z.enum(['hobby', 'activity', 'derived']);
export const frequencySchema = z.enum(['daily', 'weekly', 'monthly']);
export const connectionContextSchema = z.enum([
  'qr',
  'event',
  'group',
  'manual',
]);
export const activitySourceSchema = z.enum(['maps', 'ticketmaster']);
export const sentimentSchema = z.enum(['positive', 'neutral', 'negative']);

export const updateProfileRequestSchema = z.object({
  displayName: z.string(),
  bio: z.string(),
  aiParagraph: z.string(),
  city: z.string(),
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
  peers: z.array(
    z.object({
      peerId: z.string(),
      wouldMeetAgain: z.boolean(),
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
