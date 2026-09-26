// Owner: Pranav (Groups, Activities & Chat) — Gemini + Maps grounding, with Ticketmaster as the secondary source.
// Maps grounding names the venue and returns its place id; Places (New) supplies coordinates, address, and price,
// which grounding alone does not. Every step degrades to the next source so a demo never hard-fails.
//
// CHANGED Sep 26 (wave 2, Sahith): the chain also runs as a RESUMABLE JOB, one external call per function
// invocation, because the team's Netlify plan caps synchronous functions at 10s and has no Background Functions.
// `runActivityStage()` advances a job by exactly one stage inside the budget it's given; routes/groups.ts stores
// the intermediate result between calls and the app calls /advance until the plan is ready:
//
//   grounded (Flash) ──fail──▶ grounded_lite ──fail──▶ ticketmaster ──fail──▶ fixture
//        │ ok                        │ ok                  │ ok
//        ▼                           ▼                     ▼
//      places  ── no location ──▶ ticketmaster           done
//        │ ok
//        ▼
//       done
//
// `generateActivity()` (the whole chain in one 9s budget) remains for mock mode and tests.
import { z } from 'zod';
import {
  activitySchema,
  type Activity,
  type ActivityJobStage,
  type GenerateActivityInput,
} from '@degrees/shared';
import { env } from '../config/env.js';
import {
  placeDetails,
  searchPlace,
  type PlaceInfo,
} from '../external/places.js';
import {
  upcomingEventsNear,
  type TicketedEvent,
} from '../external/ticketmaster.js';
import { log } from '../lib/log.js';
import { activityFixture } from '../mocks/fixtures.js';
import { FLASH_LITE_MODEL, FLASH_MODEL, getAiClient } from './client.js';

// The server runs on Netlify Functions, whose synchronous requests time out after ~10s by default, so the whole
// fallback chain shares one deadline and the fixture answers if time runs out.
const BUDGET_MS = 9_000;
// Held back from the Maps attempt so Ticketmaster still has time to answer.
const TICKETMASTER_RESERVE_MS = 2_500;
// Held back from the Flash attempt so the Lite retry still has time.
const LITE_RESERVE_MS = 2_500;
const MIN_ATTEMPT_MS = 500;
const EARTH_RADIUS_MI = 3958.8;

// Milliseconds left before the deadline, minus whatever a later step needs kept in reserve.
type Budget = (reserveMs?: number) => number;

function makeBudget(totalMs: number): Budget {
  const deadline = Date.now() + totalMs;
  return (reserveMs = 0) => Math.max(0, deadline - Date.now() - reserveMs);
}

function timeoutSignal(ms: number): AbortSignal {
  if (ms < MIN_ATTEMPT_MS) {
    throw new Error('Out of time for this step.');
  }
  return AbortSignal.timeout(ms);
}

// What the grounded call must return. Grounded calls can't rely on responseSchema, so the prompt asks for
// JSON and this validates it. address/lat/lng are only a fallback for when Places is unavailable.
const groundedPlanSchema = z.object({
  venue: z.string().min(1),
  title: z.string().min(1),
  estimatedPricePerPersonUsd: z.number().nonnegative().nullable().optional(),
  reasoning: z.string().min(1),
  address: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
});
export type GroundedPlan = z.infer<typeof groundedPlanSchema>;

const citedPlaceSchema = z.object({
  title: z.string(),
  placeId: z.string().nullable(),
  uri: z.string().nullable(),
});
export type CitedPlace = z.infer<typeof citedPlaceSchema>;

// The job row stored in activities.job between advances. Validated on read so a hand-edited or stale row can't
// crash the route — an unparseable job restarts from the first stage.
export const activityJobSchema = z.object({
  stage: z.enum(['grounded', 'grounded_lite', 'places', 'ticketmaster', 'fixture']),
  plan: groundedPlanSchema.optional(),
  places: z.array(citedPlaceSchema).optional(),
  startedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  // Set while an advance is running so a concurrent poll returns the current state instead of doing the work twice.
  lockedUntil: z.iso.datetime().optional(),
  errors: z.array(z.string()).default([]),
});
export type ActivityJob = z.infer<typeof activityJobSchema>;

export function newActivityJob(now = new Date()): ActivityJob {
  const iso = now.toISOString();
  return { stage: 'grounded', startedAt: iso, updatedAt: iso, errors: [] };
}

const eventPickSchema = z.object({
  index: z.number().int().nonnegative(),
  title: z.string().min(1),
  reasoning: z.string().min(1),
});

function milesBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(h));
}

// Try Flash, then Lite: an overloaded model should cost a second, not the plan. `reserveMs` is time a later
// step needs, which neither attempt may spend.
async function withModelFallback<T>(
  budget: Budget,
  reserveMs: number,
  call: (model: string, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  try {
    return await call(
      FLASH_MODEL,
      timeoutSignal(budget(reserveMs + LITE_RESERVE_MS)),
    );
  } catch (error) {
    console.warn(
      `[generateActivity] ${FLASH_MODEL} failed; retrying with ${FLASH_LITE_MODEL}`,
      error,
    );
    return call(FLASH_LITE_MODEL, timeoutSignal(budget(reserveMs)));
  }
}

function describeGroup(input: GenerateActivityInput): string {
  const members = input.members
    .map(
      ({ displayName, interests }) =>
        `- ${displayName}: ${interests.length > 0 ? interests.join(', ') : 'no interests listed'}`,
    )
    .join('\n');
  const { maxCostCents, maxTravelMi, city } = input.constraints;
  return `Group (${input.members.length} people, meeting in person, most of them just met):
${members}

Constraints: at most $${(maxCostCents / 100).toFixed(0)} per person, within ${maxTravelMi} miles, in or near ${city}.`;
}

// Models sometimes wrap JSON in prose or code fences; take the outermost object.
function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error('Model reply contained no JSON object.');
  }
  return JSON.parse(text.slice(start, end + 1));
}

// One grounded Gemini call with one model. The stage runner calls this directly (Flash on one advance, Lite on
// the next); the single-budget path wraps it in withModelFallback.
async function groundedPlanWith(
  model: string,
  input: GenerateActivityInput,
  abortSignal: AbortSignal,
): Promise<{ plan: GroundedPlan; places: CitedPlace[] }> {
  const { lat, lng } = input.constraints;
  const response = await getAiClient().models.generateContent({
    model,
    contents: `You plan real-world hangouts for small groups of college students who want to become friends.

${describeGroup(input)}

Use Google Maps to choose ONE real, currently open venue for a low-pressure activity that most of the group would enjoy together — something to do, not just somewhere to sit. Respect the budget and distance.

Reply with only a JSON object, no prose:
{"venue": "<exact Google Maps name of the venue>", "title": "<short plan title, e.g. 'Bouldering + tacos after'>", "estimatedPricePerPersonUsd": <number or null>, "reasoning": "<one or two friendly sentences naming which members' interests this fits>", "address": "<street address>", "lat": <number>, "lng": <number>}`,
    config: {
      tools: [{ googleMaps: {} }],
      toolConfig: {
        retrievalConfig: { latLng: { latitude: lat, longitude: lng } },
      },
      abortSignal,
    },
  });
  const plan = groundedPlanSchema.parse(extractJson(response.text ?? ''));
  const places = (
    response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []
  ).flatMap(({ maps }) =>
    maps?.title
      ? [
          {
            // Grounding titles arrive as "Central Rock Gym - Midtown - Google Maps".
            title: maps.title.replace(/\s+-\s+Google Maps$/i, ''),
            placeId: maps.placeId ?? null,
            uri: maps.uri ?? null,
          },
        ]
      : [],
  );
  return { plan, places };
}

async function groundedPlan(
  input: GenerateActivityInput,
  budget: Budget,
): Promise<{ plan: GroundedPlan; places: CitedPlace[] }> {
  return withModelFallback(budget, TICKETMASTER_RESERVE_MS, (model, abortSignal) =>
    groundedPlanWith(model, input, abortSignal),
  );
}

// Turn a grounded plan into a full Activity: resolve the cited place through Places (New) for coordinates,
// address, and price, else accept the model's own coordinates if they're sane. Throws when there's no location.
async function assembleFromMaps(
  input: GenerateActivityInput,
  plan: GroundedPlan,
  places: CitedPlace[],
  placesTimeoutMs: number,
): Promise<Activity> {
  const center = input.constraints;
  // Names drift between the reply and the citation ("Your 3rd Spot" vs "Your 3rd Spot - Westside"), so compare
  // loosely; a lone citation is the venue.
  const normalize = (name: string) =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const wanted = normalize(plan.venue);
  const cited =
    places.find(({ title }) => normalize(title) === wanted) ??
    places.find(({ title }) => {
      const candidate = normalize(title);
      return candidate.startsWith(wanted) || wanted.startsWith(candidate);
    }) ??
    (places.length === 1 ? places[0] : undefined);

  let place: PlaceInfo | null = null;
  try {
    place = cited?.placeId
      ? await placeDetails(cited.placeId, placesTimeoutMs)
      : await searchPlace(
          `${plan.venue}, ${center.city}`,
          { lat: center.lat, lng: center.lng, radiusMi: center.maxTravelMi },
          placesTimeoutMs,
        );
  } catch (error) {
    console.warn(
      '[generateActivity] Places lookup failed; using the model-provided location',
      error,
    );
  }

  // Without Places, accept the model's own coordinates only if they land within a sane distance.
  const modelLocation =
    typeof plan.lat === 'number' &&
    typeof plan.lng === 'number' &&
    milesBetween(center, { lat: plan.lat, lng: plan.lng }) <=
      Math.max(center.maxTravelMi * 2, 15)
      ? { lat: plan.lat, lng: plan.lng }
      : null;
  const location = place ?? modelLocation;
  if (!location) {
    throw new Error(`No coordinates for "${plan.venue}".`);
  }

  const estimate =
    plan.estimatedPricePerPersonUsd === null ||
    plan.estimatedPricePerPersonUsd === undefined
      ? null
      : Math.round(plan.estimatedPricePerPersonUsd * 100);
  return activitySchema.parse({
    title: plan.title,
    venue: place?.name || plan.venue,
    address: place?.address || plan.address || center.city,
    lat: location.lat,
    lng: location.lng,
    // The model's estimate reflects the planned activity; Places only knows the venue's general tier.
    priceCents: estimate ?? place?.priceCents ?? null,
    startsAt: null,
    source: 'maps',
    sourceUrl: place?.mapsUri ?? cited?.uri ?? null,
    reasoning: plan.reasoning,
  });
}

async function fromMaps(
  input: GenerateActivityInput,
  budget: Budget,
): Promise<Activity> {
  const { plan, places } = await groundedPlan(input, budget);
  return assembleFromMaps(input, plan, places, budget(TICKETMASTER_RESERVE_MS));
}

async function pickEvent(
  input: GenerateActivityInput,
  events: TicketedEvent[],
  budget: Budget,
): Promise<z.infer<typeof eventPickSchema>> {
  const listing = events
    .map(
      (event, index) =>
        `${index}. ${event.name} at ${event.venue}` +
        `${event.genres.length > 0 ? ` (${event.genres.join(' / ')})` : ''}` +
        `${event.minPriceCents === null ? '' : `, from $${(event.minPriceCents / 100).toFixed(0)}`}`,
    )
    .join('\n');
  try {
    const response = await withModelFallback(budget, 0, (model, abortSignal) =>
      getAiClient().models.generateContent({
        model,
        contents: `${describeGroup(input)}

Pick the ONE upcoming event below this group would most enjoy together.

${listing}`,
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: z.toJSONSchema(eventPickSchema),
          abortSignal,
        },
      }),
    );
    const pick = eventPickSchema.parse(JSON.parse(response.text ?? ''));
    if (pick.index < events.length) {
      return pick;
    }
  } catch (error) {
    console.warn(
      '[generateActivity] Gemini event pick failed; taking the soonest event',
      error,
    );
  }
  const soonest = events[0];
  return {
    index: 0,
    title: soonest ? soonest.name : 'Night out',
    reasoning: 'The soonest ticketed event nearby that fits the group budget.',
  };
}

async function fromTicketmaster(
  input: GenerateActivityInput,
  budget: Budget,
): Promise<Activity> {
  const { lat, lng, maxTravelMi, maxCostCents } = input.constraints;
  const events = (
    await upcomingEventsNear(
      { lat, lng, radiusMi: maxTravelMi },
      // Leave time for Gemini to pick from the list.
      budget(1_500),
    )
  ).filter(
    (event) =>
      event.minPriceCents === null || event.minPriceCents <= maxCostCents,
  );
  if (events.length === 0) {
    throw new Error('No affordable Ticketmaster events nearby.');
  }
  // Keep the prompt small; events are already sorted soonest first.
  const shortlist = events.slice(0, 20);
  const pick = await pickEvent(input, shortlist, budget);
  const event = shortlist[pick.index];
  if (!event) {
    throw new Error('Event pick out of range.');
  }
  return activitySchema.parse({
    title: pick.title,
    venue: event.venue,
    address: event.address,
    lat: event.lat,
    lng: event.lng,
    priceCents: event.minPriceCents,
    startsAt: event.startsAt,
    source: 'ticketmaster',
    sourceUrl: event.url,
    reasoning: pick.reasoning,
  });
}

// The whole chain inside one budget — mock mode, tests, and anything that can afford to wait.
export async function generateActivity(
  input: GenerateActivityInput,
): Promise<Activity> {
  if (env.mockMode || !env.geminiApiKey) {
    return activityFixture;
  }
  const budget = makeBudget(BUDGET_MS);
  try {
    return await fromMaps(input, budget);
  } catch (error) {
    console.warn(
      '[generateActivity] Maps-grounded plan failed; trying Ticketmaster',
      error,
    );
  }
  try {
    return await fromTicketmaster(input, budget);
  } catch (error) {
    console.warn(
      '[generateActivity] Ticketmaster plan failed; using the fallback plan',
      error,
    );
  }
  return activityFixture;
}

export interface StageResult {
  job: ActivityJob;
  // Non-null exactly when the job has finished: the plan to save as 'ready'.
  activity: Activity | null;
}

const NEXT_ON_FAILURE: Record<ActivityJobStage, ActivityJobStage> = {
  grounded: 'grounded_lite',
  grounded_lite: 'ticketmaster',
  places: 'ticketmaster',
  ticketmaster: 'fixture',
  fixture: 'fixture',
};

// Advance a job by exactly one stage — one external call (or one Places lookup) inside `budgetMs`, which the
// caller sizes to fit a single function invocation. Never throws: a failed stage records the error and moves the
// job to the next fallback; the 'fixture' stage always completes.
export async function runActivityStage(
  job: ActivityJob,
  input: GenerateActivityInput,
  budgetMs: number,
): Promise<StageResult> {
  const budget = makeBudget(budgetMs);
  const now = () => new Date().toISOString();
  const stage = job.stage;
  const fail = (error: unknown): StageResult => {
    const message = error instanceof Error ? error.message : String(error);
    log.warn('activity.stage.failed', { stage, next: NEXT_ON_FAILURE[stage], message });
    return {
      job: {
        ...job,
        stage: NEXT_ON_FAILURE[stage],
        updatedAt: now(),
        errors: [...job.errors, `${stage}: ${message}`].slice(-8),
      },
      activity: null,
    };
  };

  // Only the grounded stages need Gemini; Places and Ticketmaster have their own keys and their own failures.
  if (!env.geminiApiKey && (stage === 'grounded' || stage === 'grounded_lite')) {
    return { job: { ...job, stage: 'fixture', updatedAt: now() }, activity: null };
  }

  try {
    switch (stage) {
      case 'grounded':
      case 'grounded_lite': {
        const model = stage === 'grounded' ? FLASH_MODEL : FLASH_LITE_MODEL;
        const { plan, places } = await groundedPlanWith(model, input, timeoutSignal(budget()));
        return { job: { ...job, stage: 'places', plan, places, updatedAt: now() }, activity: null };
      }
      case 'places': {
        if (!job.plan) {
          throw new Error('No grounded plan to resolve.');
        }
        const activity = await assembleFromMaps(input, job.plan, job.places ?? [], budget());
        return { job: { ...job, updatedAt: now() }, activity };
      }
      case 'ticketmaster': {
        const activity = await fromTicketmaster(input, budget);
        return { job: { ...job, updatedAt: now() }, activity };
      }
      case 'fixture':
        return { job: { ...job, updatedAt: now() }, activity: activityFixture };
    }
  } catch (error) {
    return fail(error);
  }
}
