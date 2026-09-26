// Owner: Pranav (Groups, Activities & Chat) — Places API (New): turns a grounded venue into coordinates, address, price.
// Needs "Places API (New)" enabled on the GOOGLE_MAPS_API_KEY project.
import { env } from '../config/env.js';

const PLACES_BASE = 'https://places.googleapis.com/v1';
const FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'priceLevel',
  'priceRange',
  'googleMapsUri',
];
const TIMEOUT_MS = 8_000;

export interface PlaceInfo {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  priceCents: number | null;
  mapsUri: string | null;
}

interface Money {
  units?: string;
  nanos?: number;
}

interface PlaceResource {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  priceLevel?: string;
  priceRange?: { startPrice?: Money };
  googleMapsUri?: string;
}

// Rough per-person cost when Places only knows the price tier.
const PRICE_LEVEL_CENTS: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1500,
  PRICE_LEVEL_MODERATE: 3000,
  PRICE_LEVEL_EXPENSIVE: 6000,
  PRICE_LEVEL_VERY_EXPENSIVE: 10000,
};

function moneyToCents(money: Money | undefined): number | null {
  if (!money?.units && !money?.nanos) {
    return null;
  }
  return (
    Number(money.units ?? 0) * 100 + Math.round((money.nanos ?? 0) / 10_000_000)
  );
}

function toPlaceInfo(place: PlaceResource): PlaceInfo | null {
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  if (!place.id || lat === undefined || lng === undefined) {
    return null;
  }
  return {
    placeId: place.id,
    name: place.displayName?.text ?? '',
    address: place.formattedAddress ?? '',
    lat,
    lng,
    priceCents:
      moneyToCents(place.priceRange?.startPrice) ??
      (place.priceLevel ? (PRICE_LEVEL_CENTS[place.priceLevel] ?? null) : null),
    mapsUri: place.googleMapsUri ?? null,
  };
}

async function placesFetch(
  path: string,
  init: RequestInit,
  fieldMask: string,
): Promise<unknown> {
  if (!env.googleMapsApiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY is not set.');
  }
  const headers = new Headers(init.headers);
  headers.set('X-Goog-Api-Key', env.googleMapsApiKey);
  headers.set('X-Goog-FieldMask', fieldMask);
  const response = await fetch(`${PLACES_BASE}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `Places ${response.status}: ${(await response.text()).slice(0, 200)}`,
    );
  }
  return response.json();
}

// placeId accepts both "places/ChIJ…" (Maps grounding) and a bare "ChIJ…".
export async function placeDetails(placeId: string): Promise<PlaceInfo | null> {
  const resource = placeId.startsWith('places/')
    ? placeId
    : `places/${placeId}`;
  const place = (await placesFetch(
    `/${resource}`,
    { method: 'GET' },
    FIELDS.join(','),
  )) as PlaceResource;
  return toPlaceInfo(place);
}

export async function searchPlace(
  query: string,
  near: { lat: number; lng: number; radiusMi: number },
): Promise<PlaceInfo | null> {
  const body = (await placesFetch(
    '/places:searchText',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: 1,
        locationBias: {
          circle: {
            center: { latitude: near.lat, longitude: near.lng },
            // Places caps the bias radius at 50 km.
            radius: Math.min(near.radiusMi * 1609, 50_000),
          },
        },
      }),
    },
    FIELDS.map((field) => `places.${field}`).join(','),
  )) as { places?: PlaceResource[] };
  const first = body.places?.[0];
  return first ? toPlaceInfo(first) : null;
}
