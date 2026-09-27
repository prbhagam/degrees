// Owner: Pranav (Groups, Activities & Chat) — Gemini + Maps and Google Search grounding, with Ticketmaster as secondary.
// Maps grounding names the venue and returns its place id; Google Search grounding verifies public admission pricing,
// day-pass rates, and scheduled event dates; Places (New) supplies coordinates, address, and price fallback.
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
//
// CHANGED Sep 26 (wave 5, Sahith): the plan actually has to fit the group's preferences. Testing showed distance
// and price flatly ignored — the prompt mentioned them once and nothing checked the result. Now: cost and
// distance are HARD CONSTRAINTS in the prompt (with the centre coordinates), shared interests are called out,
// the assembled plan is REJECTED if it's farther than maxTravelMi (+15%) or dearer than maxCostCents, and a
// constraint rejection sends the job back to the grounded stage with the rejection in the prompt (up to two
// times) before falling through to Lite / Ticketmaster / fixture.
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
  startsAt: z.string().nullable().optional(),
});
export type GroundedPlan = z.infer<typeof groundedPlanSchema>;

export function parseIsoOrNull(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

const citedPlaceSchema = z.object({
  title: z.string(),
  placeId: z.string().nullable(),
  uri: z.string().nullable(),
});
export type CitedPlace = z.infer<typeof citedPlaceSchema>;

export function extractCitedPlaces(
  chunks: Array<{ maps?: { title?: string; placeId?: string; uri?: string }; web?: { title?: string; uri?: string } }> = [],
): CitedPlace[] {
  const places: CitedPlace[] = [];
  for (const chunk of chunks) {
    if (chunk?.maps?.title) {
      places.push({
        // Grounding titles arrive as "Central Rock Gym - Midtown - Google Maps".
        title: chunk.maps.title.replace(/\s+-\s+Google Maps$/i, ''),
        placeId: chunk.maps.placeId ?? null,
        uri: chunk.maps.uri ?? null,
      });
    }
    if (chunk?.web?.title && chunk?.web?.uri) {
      places.push({
        title: chunk.web.title,
        placeId: null,
        uri: chunk.web.uri,
      });
    }
  }
  return places;
}

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
  // wave 5: plans the constraints threw out, fed back into the next grounded attempt (max MAX_REJECTIONS).
  rejected: z.array(z.object({ venue: z.string(), reason: z.string() })).default([]),
});
export type ActivityJob = z.infer<typeof activityJobSchema>;

export function newActivityJob(now = new Date()): ActivityJob {
  const iso = now.toISOString();
  return { stage: 'grounded', startedAt: iso, updatedAt: iso, errors: [], rejected: [] };
}

// How many constraint rejections get a fresh grounded attempt before the job falls through the chain.
export const MAX_REJECTIONS = 2;
// A venue may sit this far past maxTravelMi and still count as "within" it (Places vs. driving distance noise).
const TRAVEL_SLACK = 1.15;

// wave 5: thrown when a plan breaks a preference or a rule — the stage runner treats these as "try again with
// this in the prompt" rather than "move on to the next source".
export class ConstraintError extends Error {
  constructor(
    public readonly venue: string,
    public readonly reason: string,
  ) {
    super(`Plan rejected: "${venue}" — ${reason}`);
    this.name = 'ConstraintError';
  }
}

// Does an assembled plan fit the group? Null when it does, else why not (in words the next prompt can use).
export function constraintViolation(
  plan: { venue: string; lat: number; lng: number; priceCents: number | null },
  input: GenerateActivityInput,
): string | null {
  const { lat, lng, maxTravelMi, maxCostCents } = input.constraints;
  const miles = milesBetween({ lat, lng }, { lat: plan.lat, lng: plan.lng });
  if (miles > maxTravelMi * TRAVEL_SLACK) {
    return `${miles.toFixed(1)} miles away, but the group's limit is ${maxTravelMi} miles`;
  }
  if (plan.priceCents !== null && plan.priceCents > maxCostCents) {
    return `about $${(plan.priceCents / 100).toFixed(0)} per person, but the group's budget is $${(maxCostCents / 100).toFixed(0)}`;
  }
  return null;
}

// Interests two or more members share (case-insensitive, first spelling kept), most shared first. Falls back to
// everyone's interests when nothing overlaps, so the planner always has tags to work from.
export function sharedInterests(input: GenerateActivityInput): string[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const member of input.members) {
    for (const label of new Set(member.interests.map((l) => l.trim()).filter(Boolean))) {
      const key = label.toLowerCase();
      const entry = counts.get(key) ?? { label, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
  }
  const shared = [...counts.values()].filter(({ count }) => count >= 2).sort((a, b) => b.count - a.count);
  const pool = shared.length > 0 ? shared : [...counts.values()];
  return pool.map(({ label }) => label);
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

export function isRateLimitError(error: unknown): boolean {
  if (!error) return false;
  const anyErr = error as any;
  if (anyErr.status === 429 || anyErr.status === 'RESOURCE_EXHAUSTED' || anyErr.code === 429) {
    return true;
  }
  if (anyErr.error?.code === 429 || anyErr.error?.status === 'RESOURCE_EXHAUSTED') {
    return true;
  }
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error);
  return (
    message.includes('429') ||
    message.includes('RESOURCE_EXHAUSTED') ||
    message.includes('exceeded your current quota') ||
    message.includes('rate limit') ||
    message.includes('Rate limit')
  );
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
    if (isRateLimitError(error)) {
      throw error;
    }
    console.warn(
      `[generateActivity] ${FLASH_MODEL} failed; retrying with ${FLASH_LITE_MODEL}`,
      error,
    );
    return call(FLASH_LITE_MODEL, timeoutSignal(budget(reserveMs)));
  }
}

// What each 'avoid' tag rules out, in venue terms the model can act on. Anything not listed is passed through as
// "no <label>". Matching is case-insensitive on the label.
const AVOID_RULES: Record<string, string> = {
  alcohol:
    'no bars, pubs, breweries, wineries, distilleries, cocktail lounges, or anything centred on drinking — pick a venue where alcohol is not the point',
  'late nights': 'nothing that starts after 8pm or runs late',
  'large crowds': 'no big crowds — skip stadiums, festivals, packed clubs, and busy nightlife',
  'high-intensity activity': 'nothing physically demanding (no intense sports, long hikes, or workouts)',
  'loud venues': 'no loud venues — skip concerts, clubs, and arcades',
  smoking: 'no hookah lounges, cigar bars, or smoking venues',
};

// Everyone's avoids, de-duplicated, as hard rules. One person avoiding alcohol means the whole group's plan avoids it:
// the plan is for the group, and "you can just not drink" is exactly what the tag opts out of.
export function avoidRules(input: GenerateActivityInput): string[] {
  const seen = new Set<string>();
  const rules: string[] = [];
  for (const member of input.members) {
    for (const label of member.avoids) {
      const key = label.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      rules.push(AVOID_RULES[key] ?? `no ${label.trim().toLowerCase()}`);
    }
  }
  return rules;
}

// Does a venue name trip one of the group's hard avoids? A cheap guard on top of the prompt: the model is told the
// rules, but a grounded reply can still name "The Local Pub"; better to fall through to the next stage than to
// hand an alcohol-avoider a pub.
const ALCOHOL_VENUE_PATTERN = /\b(bar|bars|pub|pubs|brewery|breweries|brewing|taproom|tap room|winery|wine bar|distillery|cocktail|saloon|beer|biergarten|beer garden|lounge)\b/i;
export function violatesAvoids(venueOrTitle: string, input: GenerateActivityInput): string | null {
  const avoids = new Set(input.members.flatMap((m) => m.avoids.map((a) => a.trim().toLowerCase())));
  if (avoids.has('alcohol') && ALCOHOL_VENUE_PATTERN.test(venueOrTitle)) {
    return `"${venueOrTitle}" looks alcohol-centred and someone here avoids alcohol.`;
  }
  return null;
}

// CHANGED Sep 27 (wave 6 follow-up, Sahith): a regenerate shows the model every plan the group already has — the whole
// plan, current one first — and makes "different" a hard requirement. It used to get only the venue names with "prefer a
// different kind of activity", and happily came back with the bowling alley across town. Venues outside the last 20
// plans still count through previousVenues (isPreviousVenue).
export function previousPlansBlock(input: GenerateActivityInput): string {
  const plans = input.previousPlans ?? [];
  const venuesOnly = input.previousVenues.filter(
    (venue) => !plans.some((plan) => normalizeName(plan.venue) === normalizeName(venue)),
  );
  if (plans.length === 0 && venuesOnly.length === 0) return '';
  const lines = [
    ...plans.map((plan, index) => {
      const what = plan.title && plan.venue ? `"${plan.title}" at ${plan.venue}` : plan.title ? `"${plan.title}"` : plan.venue;
      return `${index + 1}. ${what}${index === 0 ? ' (the current plan)' : ''}`;
    }),
    ...venuesOnly.map((venue, index) => `${plans.length + index + 1}. ${venue}`),
  ];
  return `\n\nPLANS THIS GROUP HAS ALREADY BEEN GIVEN — they asked for something NEW:
${lines.join('\n')}
The new plan MUST be different from EVERY plan above. That means:
- a different venue (never one of these, or another location of the same place or chain), AND
- a different kind of activity (if they've had bowling, not another bowling alley, arcade, or games bar; if they've had a café, not another café).
A plan that repeats or closely resembles any of these is wrong, even if it fits the group well.`;
}

function describeGroup(input: GenerateActivityInput, rejections: ActivityJob['rejected'] = []): string {
  const members = input.members
    .map(
      ({ displayName, interests }) =>
        `- ${displayName}: ${interests.length > 0 ? interests.join(', ') : 'no interests listed'}`,
    )
    .join('\n');
  const { maxCostCents, maxTravelMi, city, lat, lng } = input.constraints;
  const rules = avoidRules(input);
  const avoidBlock =
    rules.length > 0
      ? `\n\nHARD RULES (someone in the group opted out of these — a plan that breaks one is wrong, even if it fits everyone else):\n${rules.map((rule) => `- ${rule}`).join('\n')}`
      : '';
  const previous = previousPlansBlock(input);
  const rejected =
    rejections.length > 0
      ? `\n\nRejected — do not pick these or anything like them: ${rejections.map(({ venue, reason }) => `${venue} (${reason})`).join('; ')}.`
      : '';
  const shared = sharedInterests(input);
  const interestsLine =
    shared.length > 0
      ? `\n\nShared interests (pick something that fits at least two of these, and say which): ${shared.join(', ')}.`
      : '';
  return `Group (${input.members.length} people, meeting in person, most of them just met):
${members}${interestsLine}

HARD CONSTRAINTS — these are the group's own settings and a plan outside them is wrong:
- DISTANCE: at most ${maxTravelMi} miles from (${lat.toFixed(4)}, ${lng.toFixed(4)}) in ${city} — check the driving distance from that point, not the city name.
- COST: at most $${(maxCostCents / 100).toFixed(0)} per person INCLUDING the activity itself (tickets, lane, session, food if it's the plan), not just entry.${avoidBlock}${previous}${rejected}`;
}

// Same loose comparison assembleFromMaps uses, so "Your 3rd Spot - Westside" still counts as "Your 3rd Spot".
const normalizeName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function isPreviousVenue(venue: string, input: GenerateActivityInput): boolean {
  const wanted = normalizeName(venue);
  if (!wanted) return false;
  return input.previousVenues.some((previous) => {
    const candidate = normalizeName(previous);
    return candidate === wanted || candidate.startsWith(wanted) || wanted.startsWith(candidate);
  });
}

// Wave 6 follow-up: the same plan at a new address ("Duckpin bowling + food hall" again) is still a repeat.
export function isPreviousTitle(title: string, input: GenerateActivityInput): boolean {
  const wanted = normalizeName(title);
  return wanted.length > 0 && (input.previousPlans ?? []).some((plan) => normalizeName(plan.title) === wanted);
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
  rejections: ActivityJob['rejected'] = [],
): Promise<{ plan: GroundedPlan; places: CitedPlace[] }> {
  const { lat, lng } = input.constraints;
  const response = await getAiClient().models.generateContent({
    model,
    contents: `You plan real-world hangouts for small groups of college students who want to become friends.

${describeGroup(input, rejections)}

Use Google Maps and Google Search to choose ONE real, currently open venue or scheduled event for a low-pressure activity that most of the group would enjoy together — something to do, not just somewhere to sit.

IMPORTANT: Do not assume an activity is free ($0) just because Google Maps does not list prices. Specialized venues (such as rock climbing gyms, bouldering, escape rooms, bowling, arcades, museums, kayak rentals, or ticketed events) typically charge day passes, entry fees, or gear rentals. Use Google Search grounding to verify actual public admission prices, day-pass rates, ticket costs, and scheduled dates/times.

The distance and cost limits above are the group's own settings: verify both before answering, and if your first idea breaks one, pick another. If plans are listed as already given, yours MUST be a new idea — different from all of them in venue and in kind of activity.

Reply with only a JSON object, no prose:
{"venue": "<exact Google Maps name of the venue>", "title": "<short plan title, e.g. 'Bouldering + tacos after'>", "estimatedPricePerPersonUsd": <number or null>, "reasoning": "<one or two friendly sentences naming which members' interests this fits and mentioning verified pricing/schedule>", "address": "<street address>", "lat": <number>, "lng": <number>, "startsAt": "<ISO 8601 datetime if this is a time-specific event, otherwise null>"}`,
    config: {
      tools: [{ googleMaps: {} }, { googleSearch: {} }],
      toolConfig: {
        retrievalConfig: { latLng: { latitude: lat, longitude: lng } },
      },
      abortSignal,
    },
  });
  const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
  log.info('ai.activity.grounding', {
    model,
    webSearchQueries: groundingMetadata?.webSearchQueries ?? [],
    webSources:
      groundingMetadata?.groundingChunks?.filter((chunk) => Boolean(chunk.web)).length ?? 0,
    mapsSources:
      groundingMetadata?.groundingChunks?.filter((chunk) => Boolean(chunk.maps)).length ?? 0,
  });
  const plan = groundedPlanSchema.parse(extractJson(response.text ?? ''));
  const violation = violatesAvoids(`${plan.venue} ${plan.title}`, input);
  if (violation) {
    throw new ConstraintError(plan.venue, `breaks an avoid rule: ${violation}`);
  }
  if (isPreviousVenue(plan.venue, input)) {
    throw new ConstraintError(plan.venue, 'already suggested to this group');
  }
  if (isPreviousTitle(plan.title, input)) {
    throw new ConstraintError(plan.venue, `"${plan.title}" repeats a plan this group already has`);
  }
  // The model's own estimate is checked here too, so an over-budget pick never costs a Places call.
  if (typeof plan.estimatedPricePerPersonUsd === 'number' && Math.round(plan.estimatedPricePerPersonUsd * 100) > input.constraints.maxCostCents) {
    throw new ConstraintError(
      plan.venue,
      `about $${plan.estimatedPricePerPersonUsd.toFixed(0)} per person, but the group's budget is $${(input.constraints.maxCostCents / 100).toFixed(0)}`,
    );
  }
  const places = extractCitedPlaces(
    response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [],
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
  const mapsPlaces = places.filter((p) => p.placeId !== null);
  const cited =
    mapsPlaces.find(({ title }) => normalize(title) === wanted) ??
    mapsPlaces.find(({ title }) => {
      const candidate = normalize(title);
      return candidate.startsWith(wanted) || wanted.startsWith(candidate);
    }) ??
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

  // Without Places, accept the model's own coordinates only if they land inside the group's range (wave 5: this
  // used to allow 2x the limit or 15 miles, whichever was larger — one of the ways distance got ignored).
  const modelLocation =
    typeof plan.lat === 'number' &&
    typeof plan.lng === 'number' &&
    milesBetween(center, { lat: plan.lat, lng: plan.lng }) <= center.maxTravelMi * TRAVEL_SLACK
      ? { lat: plan.lat, lng: plan.lng }
      : null;
  const location = place ?? modelLocation;
  if (!location) {
    throw new ConstraintError(plan.venue, `no location inside the group's ${center.maxTravelMi}-mile range`);
  }

  const estimate =
    plan.estimatedPricePerPersonUsd === null ||
    plan.estimatedPricePerPersonUsd === undefined
      ? null
      : Math.round(plan.estimatedPricePerPersonUsd * 100);
  const activity = activitySchema.parse({
    title: plan.title,
    venue: place?.name || plan.venue,
    address: place?.address || plan.address || center.city,
    lat: location.lat,
    lng: location.lng,
    // The model's estimate reflects the planned activity; Places only knows the venue's general tier.
    priceCents: estimate ?? place?.priceCents ?? null,
    startsAt: parseIsoOrNull(plan.startsAt),
    source: 'maps',
    sourceUrl: place?.mapsUri ?? cited?.uri ?? null,
    reasoning: plan.reasoning,
  });
  // wave 5: the resolved venue has to fit the group's range and budget, whatever the model claimed.
  const violation = constraintViolation(activity, input);
  if (violation) {
    throw new ConstraintError(activity.venue, violation);
  }
  return activity;
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

Pick the ONE upcoming event below this group would most enjoy together. The hard rules above apply to the event too.

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
      (event.minPriceCents === null || event.minPriceCents <= maxCostCents) &&
      // wave 5: the API's radius is a hint; measure it.
      milesBetween({ lat, lng }, { lat: event.lat, lng: event.lng }) <= maxTravelMi * TRAVEL_SLACK &&
      !isPreviousVenue(event.venue, input) &&
      !input.previousVenues.some((previous) => normalizeName(previous) === normalizeName(event.name)) &&
      violatesAvoids(`${event.name} ${event.venue}`, input) === null,
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
    if (isRateLimitError(error)) {
      throw error;
    }
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
  // Set to true when the job failed permanently (e.g. rate limit exhausted) and should not fall back or retry.
  failed?: boolean;
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
    const errors = [...job.errors, `${stage}: ${message}`].slice(-8);

    if (isRateLimitError(error)) {
      log.error('activity.stage.ratelimit', error, { stage, message });
      return {
        job: { ...job, updatedAt: now(), errors },
        activity: null,
        failed: true,
      };
    }

    // wave 5: a plan that broke a preference gets another grounded attempt with the rejection in the prompt,
    // rather than handing the group a Ticketmaster event (or the fixture) for a limit the model can meet.
    if (
      error instanceof ConstraintError &&
      (stage === 'grounded' || stage === 'grounded_lite' || stage === 'places') &&
      job.rejected.length < MAX_REJECTIONS
    ) {
      const rejected = [...job.rejected, { venue: error.venue, reason: error.reason }];
      log.warn('activity.stage.rejected', { stage, venue: error.venue, reason: error.reason, attempt: rejected.length });
      const { plan: _plan, places: _places, ...rest } = job;
      return { job: { ...rest, stage: 'grounded', updatedAt: now(), errors, rejected }, activity: null };
    }
    log.warn('activity.stage.failed', { stage, next: NEXT_ON_FAILURE[stage], message });
    return {
      job: {
        ...job,
        stage: NEXT_ON_FAILURE[stage],
        updatedAt: now(),
        errors,
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
        const { plan, places } = await groundedPlanWith(model, input, timeoutSignal(budget()), job.rejected);
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
