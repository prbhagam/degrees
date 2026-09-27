// Owner: Pranav (Groups, Activities & Chat) — degree + path lookups over `connections` for the group view and graph.
import type { ReachCount, ReachResponse } from '@degrees/shared';
import { getServiceClient } from '../db/supabase.js';

// Matches preferences.max_degrees (1–3); beyond this the pool stops meaning anything.
export const MAX_GRAPH_DEPTH = 3;

export interface Edge {
  a: string;
  b: string;
}

export interface Reach {
  degree: number;
  // Ids strictly between the viewer and the target, nearest the viewer first.
  via: string[];
}

export interface Neighborhood {
  reach: Map<string, Reach>;
  edges: Edge[];
}

async function edgesTouching(ids: string[]): Promise<Edge[]> {
  const list = ids.join(',');
  const { data, error } = await getServiceClient()
    .from('connections')
    .select('user_a, user_b')
    .or(`user_a.in.(${list}),user_b.in.(${list})`);
  if (error) {
    throw new Error(`connections read failed: ${error.message}`);
  }
  return data.map((row) => ({
    a: row.user_a as string,
    b: row.user_b as string,
  }));
}

// Breadth-first from the viewer. Edges are stored once (user_a < user_b), so every hop checks both columns.
// Stops early once every id in `stopWhenFound` is reached.
export async function exploreFrom(
  viewerId: string,
  maxDepth = MAX_GRAPH_DEPTH,
  stopWhenFound?: readonly string[],
): Promise<Neighborhood> {
  const reach = new Map<string, Reach>([[viewerId, { degree: 0, via: [] }]]);
  const edgeKeys = new Set<string>();
  const edges: Edge[] = [];
  let frontier = [viewerId];

  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
    if (stopWhenFound?.every((id) => reach.has(id))) {
      break;
    }
    const next: string[] = [];
    for (const edge of await edgesTouching(frontier)) {
      const key = `${edge.a}:${edge.b}`;
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        edges.push(edge);
      }
      for (const [from, to] of [
        [edge.a, edge.b],
        [edge.b, edge.a],
      ] as const) {
        const parent = reach.get(from);
        if (parent?.degree === depth - 1 && !reach.has(to)) {
          reach.set(to, {
            degree: depth,
            via: from === viewerId ? [] : [...parent.via, from],
          });
          next.push(to);
        }
      }
    }
    frontier = next;
  }
  return { reach, edges };
}

// Added Sep 27 (wave 6): the preferences dial's real numbers. `mine` walks out from the viewer (fresh every call, so a
// connection made a minute ago counts). `typical` needs everyone's reach, so it loads the whole edge list once and
// BFSes from each connected person (sampled past TYPICAL_SAMPLE people), cached for TYPICAL_TTL_MS.
const TYPICAL_TTL_MS = 5 * 60 * 1000;
const TYPICAL_SAMPLE = 400;
const EDGE_PAGE = 1000;
const MAX_EDGE_PAGES = 50;
let typicalCache: { at: number; value: ReachCount[] | null } | null = null;

function cumulative(degrees: Iterable<number>, maxDepth: number): ReachCount[] {
  const counts = Array.from({ length: maxDepth }, () => 0);
  for (const degree of degrees) {
    for (let d = Math.max(degree, 1); d <= maxDepth; d++) counts[d - 1]! += 1;
  }
  return counts.map((people, index) => ({ degree: index + 1, people }));
}

async function allEdges(): Promise<Edge[]> {
  const edges: Edge[] = [];
  for (let page = 0; page < MAX_EDGE_PAGES; page++) {
    const { data, error } = await getServiceClient()
      .from('connections')
      .select('user_a, user_b')
      .order('user_a')
      .order('user_b')
      .range(page * EDGE_PAGE, (page + 1) * EDGE_PAGE - 1);
    if (error) throw new Error(`connections read failed: ${error.message}`);
    edges.push(...data.map((row) => ({ a: row.user_a as string, b: row.user_b as string })));
    if (data.length < EDGE_PAGE) break;
  }
  return edges;
}

function median(values: number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

async function typicalReach(maxDepth: number, now = Date.now()): Promise<ReachCount[] | null> {
  if (typicalCache && now - typicalCache.at < TYPICAL_TTL_MS) return typicalCache.value;
  const neighbors = new Map<string, string[]>();
  for (const { a, b } of await allEdges()) {
    neighbors.set(a, [...(neighbors.get(a) ?? []), b]);
    neighbors.set(b, [...(neighbors.get(b) ?? []), a]);
  }
  const people = [...neighbors.keys()].sort();
  let value: ReachCount[] | null = null;
  if (people.length > 0) {
    // Evenly spaced over the sorted ids: deterministic, and cheap on a big graph.
    const step = Math.max(1, Math.ceil(people.length / TYPICAL_SAMPLE));
    const perPerson: ReachCount[][] = [];
    for (let i = 0; i < people.length; i += step) {
      const start = people[i]!;
      const seen = new Map<string, number>([[start, 0]]);
      let frontier = [start];
      for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
        const next: string[] = [];
        for (const id of frontier) {
          for (const other of neighbors.get(id) ?? []) {
            if (!seen.has(other)) {
              seen.set(other, depth);
              next.push(other);
            }
          }
        }
        frontier = next;
      }
      seen.delete(start);
      perPerson.push(cumulative(seen.values(), maxDepth));
    }
    value = Array.from({ length: maxDepth }, (_, index) => ({
      degree: index + 1,
      people: median(perPerson.map((counts) => counts[index]!.people)),
    }));
  }
  typicalCache = { at: now, value };
  return value;
}

export async function reachSummary(viewerId: string): Promise<ReachResponse> {
  const [{ reach }, typical] = await Promise.all([exploreFrom(viewerId, MAX_GRAPH_DEPTH), typicalReach(MAX_GRAPH_DEPTH)]);
  reach.delete(viewerId);
  return {
    mine: cumulative([...reach.values()].map((path) => path.degree), MAX_GRAPH_DEPTH),
    typical,
  };
}

export async function displayNames(
  ids: Iterable<string>,
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) {
    return new Map();
  }
  const { data, error } = await getServiceClient()
    .from('profiles')
    .select('id, username, display_name')
    .in('id', unique);
  if (error) {
    throw new Error(`profiles read failed: ${error.message}`);
  }
  return new Map(
    data.map((row) => [
      row.id as string,
      (row.display_name as string | null) ?? (row.username as string),
    ]),
  );
}

export interface ProfileBasics {
  displayName: string;
  bio: string | null;
  photoUrl: string | null;
}

// Like displayNames, but for contexts where the viewer has already met these people in person
// (event co-attendance, a confirmed group) and the design calls for showing bio + photo too, not
// just a name.
export async function profileBasics(
  ids: Iterable<string>,
): Promise<Map<string, ProfileBasics>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) {
    return new Map();
  }
  const { data, error } = await getServiceClient()
    .from('profiles')
    .select('id, username, display_name, bio, photo_url')
    .in('id', unique);
  if (error) {
    throw new Error(`profiles read failed: ${error.message}`);
  }
  return new Map(
    data.map((row) => [
      row.id as string,
      {
        displayName: (row.display_name as string | null) ?? (row.username as string),
        bio: (row.bio as string | null) ?? null,
        photoUrl: (row.photo_url as string | null) ?? null,
      },
    ]),
  );
}
