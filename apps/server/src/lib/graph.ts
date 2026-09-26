// Owner: Pranav (Groups, Activities & Chat) — degree + path lookups over `connections` for the group view and graph.
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
