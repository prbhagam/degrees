// Owner: Pranav (Groups, Activities & Chat) — Ticketmaster Discovery: real ticketed events, the secondary activity source.
// Free tier is 5,000 calls/day at 5 req/sec, so results are cached per area instead of fetched per request.
import { env } from '../config/env.js';

const DISCOVERY_URL = 'https://app.ticketmaster.com/discovery/v2/events.json';
const CACHE_TTL_MS = 10 * 60_000;
const LOOKAHEAD_DAYS = 14;
const DEFAULT_TIMEOUT_MS = 4_000;

export interface TicketedEvent {
  name: string;
  venue: string;
  address: string;
  lat: number;
  lng: number;
  minPriceCents: number | null;
  startsAt: string | null;
  url: string | null;
  genres: string[];
}

interface DiscoveryEvent {
  name?: string;
  url?: string;
  dates?: { start?: { dateTime?: string } };
  priceRanges?: { min?: number; currency?: string }[];
  classifications?: {
    segment?: { name?: string };
    genre?: { name?: string };
    subGenre?: { name?: string };
  }[];
  _embedded?: {
    venues?: {
      name?: string;
      address?: { line1?: string };
      city?: { name?: string };
      state?: { stateCode?: string };
      postalCode?: string;
      location?: { latitude?: string; longitude?: string };
    }[];
  };
}

const cache = new Map<string, { at: number; events: TicketedEvent[] }>();

// Discovery wants second precision with no milliseconds: 2026-09-26T18:00:00Z.
const discoveryTime = (date: Date) => `${date.toISOString().slice(0, 19)}Z`;

function toTicketedEvent(event: DiscoveryEvent): TicketedEvent | null {
  const venue = event._embedded?.venues?.[0];
  const lat = Number(venue?.location?.latitude);
  const lng = Number(venue?.location?.longitude);
  if (
    !event.name ||
    !venue?.name ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return null;
  }
  const usdPrice = event.priceRanges?.find(
    (range) => range.currency === undefined || range.currency === 'USD',
  )?.min;
  const address = [
    venue.address?.line1,
    venue.city?.name,
    [venue.state?.stateCode, venue.postalCode].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');
  const classification = event.classifications?.[0];
  return {
    name: event.name,
    venue: venue.name,
    address,
    lat,
    lng,
    minPriceCents: usdPrice === undefined ? null : Math.round(usdPrice * 100),
    startsAt: event.dates?.start?.dateTime
      ? new Date(event.dates.start.dateTime).toISOString()
      : null,
    url: event.url ?? null,
    genres: [
      classification?.segment?.name,
      classification?.genre?.name,
      classification?.subGenre?.name,
    ].filter((name): name is string => Boolean(name) && name !== 'Undefined'),
  };
}

export async function upcomingEventsNear(
  near: { lat: number; lng: number; radiusMi: number },
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<TicketedEvent[]> {
  if (!env.ticketmasterApiKey) {
    throw new Error('TICKETMASTER_API_KEY is not set.');
  }
  const radius = Math.max(1, Math.min(Math.round(near.radiusMi), 50));
  const key = `${near.lat.toFixed(2)},${near.lng.toFixed(2)},${radius}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.events;
  }

  const now = new Date();
  const params = new URLSearchParams({
    apikey: env.ticketmasterApiKey,
    latlong: `${near.lat},${near.lng}`,
    radius: String(radius),
    unit: 'miles',
    size: '40',
    sort: 'date,asc',
    startDateTime: discoveryTime(now),
    endDateTime: discoveryTime(
      new Date(now.getTime() + LOOKAHEAD_DAYS * 86_400_000),
    ),
  });
  const response = await fetch(`${DISCOVERY_URL}?${params}`, {
    signal: AbortSignal.timeout(
      Math.max(1, Math.min(timeoutMs, DEFAULT_TIMEOUT_MS)),
    ),
  });
  if (!response.ok) {
    throw new Error(
      `Ticketmaster ${response.status}: ${(await response.text()).slice(0, 200)}`,
    );
  }
  const body = (await response.json()) as {
    _embedded?: { events?: DiscoveryEvent[] };
  };
  // Season passes and duplicate showtimes crowd the list; keep one entry per event name.
  const seen = new Set<string>();
  const events = (body._embedded?.events ?? [])
    .map(toTicketedEvent)
    .filter((event): event is TicketedEvent => {
      if (!event || /\bpass\b/i.test(event.name) || seen.has(event.name)) {
        return false;
      }
      seen.add(event.name);
      return true;
    });
  cache.set(key, { at: Date.now(), events });
  return events;
}
