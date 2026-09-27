// Owner: Pranav (Groups, Activities & Chat) — Added Sep 27 (wave 6, Sahith). Where everyone sits on the Circle map
// (CircleGraph). Plain math, no React Native, so it can be checked outside the app.

export const R = 22; // a person's radius
export const ME_R = 27;
const ORBIT = 112; // the single ring's radius when everyone fits on one
const SLOT_GAP = 10; // space between neighbours on a ring

// People who know each other sit next to each other: walk each mutual-friend cluster breadth-first, best-connected
// first, and seat them in that order.
export function clusterOrder(nodes: { id: string }[], mutualEdges: { a: string; b: string }[]): number[] {
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const neighbors = nodes.map(() => [] as number[]);
  for (const { a, b } of mutualEdges) {
    const ia = index.get(a);
    const ib = index.get(b);
    if (ia === undefined || ib === undefined || ia === ib) continue;
    neighbors[ia]!.push(ib);
    neighbors[ib]!.push(ia);
  }
  const byDegree = nodes.map((_, i) => i).sort((x, y) => neighbors[y]!.length - neighbors[x]!.length);
  const seen = new Set<number>();
  const order: number[] = [];
  for (const start of byDegree) {
    if (seen.has(start)) continue;
    seen.add(start);
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.shift()!;
      order.push(current);
      const next = neighbors[current]!.filter((n) => !seen.has(n)).sort((x, y) => neighbors[y]!.length - neighbors[x]!.length);
      for (const n of next) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return order;
}

// Home spots: one ring at ORBIT when everyone fits, otherwise concentric rings out to the canvas edge, each filled in
// proportion to how many it can seat (a very large circle just packs the rings tighter).
export function homeSpots(count: number, cx: number, cy: number): { x: number; y: number; ring: number }[] {
  if (count === 0) return [];
  const slot = 2 * R + SLOT_GAP;
  const maxRadius = Math.max(ME_R + R + 8, Math.min(cx, cy) - R - 6);
  const capacity = (radius: number) => Math.max(1, Math.floor((2 * Math.PI * radius) / slot));
  const single = Math.min(ORBIT, maxRadius);
  let rings: { radius: number; count: number }[];
  if (count <= capacity(single)) {
    rings = [{ radius: single, count }];
  } else {
    const radii: number[] = [];
    for (let radius = ME_R + R + 20; radius <= maxRadius; radius += slot) radii.push(radius);
    if (radii.length === 0) radii.push(maxRadius);
    const caps = radii.map(capacity);
    const total = caps.reduce((sum, cap) => sum + cap, 0);
    let left = count;
    rings = radii.map((radius, i) => {
      const share = i === radii.length - 1 ? left : Math.min(left, Math.round((count * caps[i]!) / total));
      left -= share;
      return { radius, count: share };
    });
  }
  const spots: { x: number; y: number; ring: number }[] = [];
  rings.forEach(({ radius, count: seats }, ring) => {
    // Alternate rings are offset half a seat so nobody lines up directly behind someone.
    const offset = ring % 2 ? Math.PI / Math.max(seats, 1) : 0;
    for (let i = 0; i < seats; i++) {
      const angle = (i / seats) * 2 * Math.PI - Math.PI / 2 + offset;
      spots.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle), ring });
    }
  });
  return spots;
}

