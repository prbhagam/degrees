// Owner: Pranav (Groups, Activities & Chat) — Added Sep 26 (wave 5, Sahith). The Map view of Your Circle, made
// physical. Wave 4 had a static SVG map plus a separate "Play" toggle where you bumped into people; the tester
// wanted one thing: the map itself should push and pull. So every node here is a body in a small spring system:
//   * you sit at the centre on a spring; each 1st-degree person hangs off you on a slack spring (the spokes);
//   * two people who also know each other (mutualEdges) share a shorter, stiffer spring, so they cluster — drag
//     one and their mutual friend comes along, while people they don't know get shoved out of the way;
//   * every pair repels a little, so nothing overlaps; collisions with speed give a haptic tap.
// Drag anyone (not just yourself), fling them, tap to select. Nothing is written anywhere — the graph is the
// server's; this only lets you feel its shape. Scope + v2 ideas: docs/PLAYGROUND.md.
import type { GraphResponse } from '@degrees/shared';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo } from 'react';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  makeMutable,
  runOnJS,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { initials } from '@/components/ui';

type Node = GraphResponse['nodes'][number];

const R = 22; // a person's radius
const ME_R = 27;
const ORBIT = 112; // rest length of the spoke between you and each person
const MUTUAL_LEN = 78; // rest length between two people who know each other
const K_SPOKE = 6; // spring stiffness (1/s²-ish; forces are per unit mass)
const K_MUTUAL = 22;
const K_CENTRE = 40; // pulls you back to the middle
const REPEL = 260_000; // pair repulsion, ~1/d²
const DAMPING = 5.5; // velocity decay per second
const MAX_DT = 1 / 30;
const BUMP_SPEED = 140; // px/s of closing speed that counts as a bump
const HAPTIC_GAP_MS = 120;

interface Body {
  x: SharedValue<number>;
  y: SharedValue<number>;
  vx: SharedValue<number>;
  vy: SharedValue<number>;
  // 1 while a finger holds this body, 0 otherwise (also drives the lift/scale).
  held: SharedValue<number>;
  // Flash after a bump; decays each frame.
  hit: SharedValue<number>;
  r: number;
}

interface Spring {
  a: number;
  b: number;
  rest: number;
  k: number;
  mutual: boolean;
}

function polar(index: number, total: number, cx: number, cy: number): { x: number; y: number } {
  const angle = (index / Math.max(total, 1)) * 2 * Math.PI - Math.PI / 2;
  return { x: cx + ORBIT * Math.cos(angle), y: cy + ORBIT * Math.sin(angle) };
}

function Edge({ from, to, spring }: { from: Body; to: Body; spring: Spring }) {
  const style = useAnimatedStyle(() => {
    const dx = to.x.value - from.x.value;
    const dy = to.y.value - from.y.value;
    const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    // A stretched spring shows its strain: darker and a touch thicker the further it is from rest.
    const strain = Math.min(1, Math.abs(len - spring.rest) / spring.rest);
    return {
      width: len,
      height: spring.mutual ? 2 + strain * 1.5 : 1.5 + strain,
      opacity: spring.mutual ? 0.55 + strain * 0.45 : 0.6 + strain * 0.4,
      transform: [
        { translateX: from.x.value },
        { translateY: from.y.value },
        { rotate: `${Math.atan2(dy, dx)}rad` },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          transformOrigin: 'left center',
          borderRadius: 2,
          backgroundColor: spring.mutual ? '#5B7A6B' : '#D6CFC2',
        },
        style,
      ]}
    />
  );
}

function Person({ node, body, selected }: { node: Node; body: Body; selected: boolean }) {
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: body.x.value - body.r },
      { translateY: body.y.value - body.r },
      { scale: 1 + body.held.value * 0.12 + body.hit.value * 0.15 },
    ],
    borderColor: body.hit.value > 0.4 || body.held.value > 0.5 ? '#E8703A' : selected ? '#E8703A' : '#20201C',
    shadowOpacity: 0.08 + body.held.value * 0.25,
  }));
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: R * 2,
          height: R * 2,
          borderRadius: R,
          backgroundColor: selected ? '#20201C' : '#FFFFFF',
          borderWidth: selected ? 2 : 1.5,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#20201C',
          shadowOffset: { width: 0, height: 4 },
          shadowRadius: 8,
        },
        style,
      ]}
    >
      <Text style={{ fontFamily: 'PublicSans_700Bold', fontSize: 12, color: selected ? '#F7F3EC' : '#20201C' }}>
        {initials(node.displayName)}
      </Text>
    </Animated.View>
  );
}

function Me({ body }: { body: Body }) {
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: body.x.value - body.r },
      { translateY: body.y.value - body.r },
      { scale: 1 + body.held.value * 0.12 },
    ],
    shadowOpacity: 0.15 + body.held.value * 0.25,
  }));
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: ME_R * 2,
          height: ME_R * 2,
          borderRadius: ME_R,
          backgroundColor: '#E8703A',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#20201C',
          shadowOffset: { width: 0, height: 6 },
          shadowRadius: 10,
        },
        style,
      ]}
    >
      <Text style={{ fontFamily: 'PublicSans_700Bold', fontSize: 12, color: '#F7F3EC' }}>0°</Text>
    </Animated.View>
  );
}

export function CircleGraph({
  nodes,
  mutualEdges,
  width,
  height = 360,
  selectedId,
  onSelect,
  onBump,
}: {
  nodes: Node[];
  mutualEdges: { a: string; b: string }[];
  width: number;
  height?: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onBump?: (name: string) => void;
}) {
  const cx = width / 2;
  const cy = height / 2;
  const idsKey = nodes.map((node) => node.id).join(',');

  // Body 0 is you; bodies 1..n follow `nodes`. Created outside React state so the frame worklet can loop them.
  const bodies = useMemo<Body[]>(
    () => [
      { x: makeMutable(cx), y: makeMutable(cy), vx: makeMutable(0), vy: makeMutable(0), held: makeMutable(0), hit: makeMutable(0), r: ME_R },
      ...nodes.map((_, index) => {
        const home = polar(index, nodes.length, cx, cy);
        return { x: makeMutable(home.x), y: makeMutable(home.y), vx: makeMutable(0), vy: makeMutable(0), held: makeMutable(0), hit: makeMutable(0), r: R };
      }),
    ],
    // Positions only need rebuilding when the set of people (or the canvas) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idsKey, cx, cy],
  );

  const springs = useMemo<Spring[]>(() => {
    const index = new Map(nodes.map((node, i) => [node.id, i + 1]));
    const spokes: Spring[] = nodes.map((_, i) => ({ a: 0, b: i + 1, rest: ORBIT, k: K_SPOKE, mutual: false }));
    const mutual: Spring[] = mutualEdges.flatMap(({ a, b }) => {
      const ia = index.get(a);
      const ib = index.get(b);
      return ia && ib && ia !== ib ? [{ a: ia, b: ib, rest: MUTUAL_LEN, k: K_MUTUAL, mutual: true }] : [];
    });
    return [...spokes, ...mutual];
  }, [nodes, mutualEdges]);

  // Which body a finger holds (-1 = none), and the last haptic time so bumps don't buzz continuously.
  const held = useSharedValue(-1);
  const lastHaptic = useSharedValue(0);

  const haptic = (name: string | null) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (name && onBump) onBump(name);
  };

  useEffect(
    () => () => {
      held.value = -1;
    },
    [held, bodies],
  );

  useFrameCallback((frame) => {
    const dt = Math.min(MAX_DT, (frame.timeSincePreviousFrame ?? 16) / 1000);
    if (dt <= 0) return;
    const n = bodies.length;
    const fx = new Array<number>(n).fill(0);
    const fy = new Array<number>(n).fill(0);

    // You are tethered to the middle.
    fx[0]! += (cx - bodies[0]!.x.value) * K_CENTRE;
    fy[0]! += (cy - bodies[0]!.y.value) * K_CENTRE;

    for (let s = 0; s < springs.length; s++) {
      const spring = springs[s]!;
      const a = bodies[spring.a]!;
      const b = bodies[spring.b]!;
      const dx = b.x.value - a.x.value;
      const dy = b.y.value - a.y.value;
      const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const f = (d - spring.rest) * spring.k;
      const ux = dx / d;
      const uy = dy / d;
      fx[spring.a]! += ux * f;
      fy[spring.a]! += uy * f;
      fx[spring.b]! -= ux * f;
      fy[spring.b]! -= uy * f;
    }

    let bumpName: string | null = null;
    let bumped = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = bodies[i]!;
        const b = bodies[j]!;
        const dx = b.x.value - a.x.value;
        const dy = b.y.value - a.y.value;
        const d2 = Math.max(100, dx * dx + dy * dy);
        const d = Math.sqrt(d2);
        const ux = dx / d;
        const uy = dy / d;
        const f = Math.min(REPEL / d2, 4000);
        fx[i]! -= ux * f;
        fy[i]! -= uy * f;
        fx[j]! += ux * f;
        fy[j]! += uy * f;
        const minDist = a.r + b.r;
        if (d < minDist) {
          // Overlap: separate hard, and count it as a bump if they came together with some speed.
          const closing = (a.vx.value - b.vx.value) * ux + (a.vy.value - b.vy.value) * uy;
          const push = (minDist - d) * 900;
          fx[i]! -= ux * push;
          fy[i]! -= uy * push;
          fx[j]! += ux * push;
          fy[j]! += uy * push;
          if (closing > BUMP_SPEED && a.hit.value < 0.3 && b.hit.value < 0.3) {
            a.hit.value = 1;
            b.hit.value = 1;
            bumped = true;
            if (i === 0 || j === 0) bumpName = nodes[(i === 0 ? j : i) - 1]?.displayName ?? null;
          }
        }
      }
    }

    const decay = Math.exp(-DAMPING * dt);
    for (let i = 0; i < n; i++) {
      const body = bodies[i]!;
      body.hit.value = Math.max(0, body.hit.value - dt * 3);
      if (held.value === i) {
        // The finger owns this body; velocity is tracked by the gesture for the fling on release.
        continue;
      }
      let vx = (body.vx.value + fx[i]! * dt) * decay;
      let vy = (body.vy.value + fy[i]! * dt) * decay;
      let x = body.x.value + vx * dt;
      let y = body.y.value + vy * dt;
      // Walls: bounce, losing some energy.
      if (x < body.r) { x = body.r; vx = Math.abs(vx) * 0.5; }
      if (x > width - body.r) { x = width - body.r; vx = -Math.abs(vx) * 0.5; }
      if (y < body.r) { y = body.r; vy = Math.abs(vy) * 0.5; }
      if (y > height - body.r) { y = height - body.r; vy = -Math.abs(vy) * 0.5; }
      body.x.value = x;
      body.y.value = y;
      body.vx.value = vx;
      body.vy.value = vy;
    }

    if (bumped) {
      const now = frame.timestamp;
      if (now - lastHaptic.value > HAPTIC_GAP_MS) {
        lastHaptic.value = now;
        runOnJS(haptic)(bumpName);
      }
    }
  });

  // Nearest body under a point, generously (a finger is wider than a node).
  const hitTest = (x: number, y: number): number => {
    'worklet';
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i]!;
      const dx = body.x.value - x;
      const dy = body.y.value - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < body.r + 14 && d < bestD) {
        best = i;
        bestD = d;
      }
    }
    return best;
  };

  const pan = Gesture.Pan()
    .minDistance(4)
    .onBegin((event) => {
      const index = hitTest(event.x, event.y);
      held.value = index;
      if (index >= 0) {
        const body = bodies[index]!;
        body.held.value = withTiming(1, { duration: 120 });
        body.vx.value = 0;
        body.vy.value = 0;
      }
    })
    .onChange((event) => {
      const index = held.value;
      if (index < 0) return;
      const body = bodies[index]!;
      body.x.value = Math.max(body.r, Math.min(width - body.r, event.x));
      body.y.value = Math.max(body.r, Math.min(height - body.r, event.y));
      // Keep the finger's velocity on the body so collisions mid-drag register as bumps.
      body.vx.value = event.velocityX;
      body.vy.value = event.velocityY;
    })
    .onFinalize((event) => {
      const index = held.value;
      held.value = -1;
      if (index < 0) return;
      const body = bodies[index]!;
      body.held.value = withTiming(0, { duration: 200 });
      // Fling: carry the release velocity (capped so nobody leaves orbit at warp speed).
      const cap = 1400;
      body.vx.value = Math.max(-cap, Math.min(cap, event.velocityX * 0.6));
      body.vy.value = Math.max(-cap, Math.min(cap, event.velocityY * 0.6));
    });

  const tap = Gesture.Tap().onEnd((event) => {
    const index = hitTest(event.x, event.y);
    const id = index > 0 ? (nodes[index - 1]?.id ?? null) : null;
    runOnJS(onSelect)(id);
  });

  const gesture = Gesture.Exclusive(pan, tap);

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width, height, overflow: 'hidden' }}>
        {/* The degree rings, for orientation: the 1st-degree orbit and a faint 2nd beyond. */}
        {[ORBIT * 2, ORBIT * 2 + 72].map((diameter, index) => (
          <View
            key={diameter}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: cx - diameter / 2,
              top: cy - diameter / 2,
              width: diameter,
              height: diameter,
              borderRadius: diameter / 2,
              borderWidth: 1,
              borderColor: index === 0 ? '#E4DDD0' : '#EFEBE3',
            }}
          />
        ))}
        {springs.map((spring, index) => (
          <Edge key={`${spring.a}-${spring.b}-${index}`} from={bodies[spring.a]!} to={bodies[spring.b]!} spring={spring} />
        ))}
        {nodes.map((node, index) => (
          <Person key={node.id} node={node} body={bodies[index + 1]!} selected={node.id === selectedId} />
        ))}
        <Me body={bodies[0]!} />
      </View>
    </GestureDetector>
  );
}
