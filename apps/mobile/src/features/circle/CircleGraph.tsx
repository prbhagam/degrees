// Owner: Pranav (Groups, Activities & Chat) — Added Sep 26 (wave 5, Sahith). The Map view of Your Circle, made
// physical.
// CHANGED Sep 27 (wave 6, Sahith): people stay put and you move. Wave 5 hung everyone off springs to each other — a
// stiff spring between every pair of mutual friends, a slack one to you, and long-range repulsion between everyone.
// Once most of a circle knew each other (the seeded demo edges), the mutual springs won and the whole circle collapsed
// into a knot at the centre. Now:
//   * every person has a fixed home spot on the rings, mutual friends seated next to each other (clusterOrder), and a
//     strong spring back to it — the map's shape never drifts;
//   * mutual friendships are drawn (sage lines), not forces;
//   * only you (the ember 0°) can be dragged. Push into people and they're shoved aside, knock into their neighbours,
//     flash, tap the phone, and settle back home. Let go and you drift back to the middle.
// Tap anyone to open their card. Nothing is written anywhere. Scope + v2 ideas: docs/PLAYGROUND.md.
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
import { clusterOrder, homeSpots, ME_R, R } from './layout';

type Node = GraphResponse['nodes'][number];

const K_HOME = 70; // pulls each person back to their spot (per unit mass)
const K_ME_HOME = 9; // once released, you drift back to the middle
const DAMPING = 8; // velocity decay per second
const PUSH = 1100; // how hard an overlap separates
const MAX_DT = 1 / 30;
const BUMP_SPEED = 120; // px/s of closing speed that counts as a bump
const HAPTIC_GAP_MS = 110;

interface Body {
  x: SharedValue<number>;
  y: SharedValue<number>;
  vx: SharedValue<number>;
  vy: SharedValue<number>;
  // 1 while a finger holds this body, 0 otherwise (drives the lift/scale). Only you can be held.
  held: SharedValue<number>;
  // Flash after a bump; decays each frame.
  hit: SharedValue<number>;
  r: number;
  homeX: number;
  homeY: number;
}

interface Line {
  a: number;
  b: number;
  rest: number;
  mutual: boolean;
}

function Edge({ from, to, line }: { from: Body; to: Body; line: Line }) {
  const style = useAnimatedStyle(() => {
    const dx = to.x.value - from.x.value;
    const dy = to.y.value - from.y.value;
    const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    // Your spokes show strain as you pull away: darker and a touch thicker the further they are from rest.
    const strain = line.mutual ? 0 : Math.min(1, Math.abs(len - line.rest) / Math.max(line.rest, 1));
    return {
      width: len,
      height: line.mutual ? 2 : 1.5 + strain,
      opacity: line.mutual ? 0.6 : 0.55 + strain * 0.45,
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
          backgroundColor: line.mutual ? '#5B7A6B' : '#D6CFC2',
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
      { scale: 1 + body.hit.value * 0.15 },
    ],
    borderColor: body.hit.value > 0.4 || selected ? '#E8703A' : '#20201C',
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
          shadowOpacity: 0.08,
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
  const edgesKey = mutualEdges.map(({ a, b }) => `${a}:${b}`).join(',');

  // Body 0 is you; bodies 1..n follow `nodes`. Created outside React state so the frame worklet can loop them.
  const { bodies, rings } = useMemo(() => {
    const order = clusterOrder(nodes, mutualEdges);
    const spots = homeSpots(nodes.length, cx, cy);
    const seat = new Map(order.map((nodeIndex, position) => [nodeIndex, spots[position]!]));
    const body = (x: number, y: number, r: number): Body => ({
      x: makeMutable(x),
      y: makeMutable(y),
      vx: makeMutable(0),
      vy: makeMutable(0),
      held: makeMutable(0),
      hit: makeMutable(0),
      r,
      homeX: x,
      homeY: y,
    });
    const radii = [...new Set(spots.map((spot) => Math.round(Math.hypot(spot.x - cx, spot.y - cy))))];
    return {
      bodies: [body(cx, cy, ME_R), ...nodes.map((_, i) => body(seat.get(i)!.x, seat.get(i)!.y, R))],
      rings: radii,
    };
    // Rebuild only when the set of people, their friendships, or the canvas changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, edgesKey, cx, cy]);

  const lines = useMemo<Line[]>(() => {
    const index = new Map(nodes.map((node, i) => [node.id, i + 1]));
    const spokes: Line[] = nodes.map((_, i) => ({
      a: 0,
      b: i + 1,
      rest: Math.hypot(bodies[i + 1]!.homeX - cx, bodies[i + 1]!.homeY - cy),
      mutual: false,
    }));
    const mutual: Line[] = mutualEdges.flatMap(({ a, b }) => {
      const ia = index.get(a);
      const ib = index.get(b);
      return ia && ib && ia !== ib ? [{ a: ia, b: ib, rest: 0, mutual: true }] : [];
    });
    return [...mutual, ...spokes];
  }, [nodes, mutualEdges, bodies, cx, cy]);

  // Whether a finger holds you, and the last haptic time so bumps don't buzz continuously.
  const holding = useSharedValue(false);
  const lastHaptic = useSharedValue(0);

  const haptic = (name: string | null) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (name && onBump) onBump(name);
  };

  useEffect(
    () => () => {
      holding.value = false;
    },
    [holding, bodies],
  );

  useFrameCallback((frame) => {
    const dt = Math.min(MAX_DT, (frame.timeSincePreviousFrame ?? 16) / 1000);
    if (dt <= 0) return;
    const n = bodies.length;
    const fx = new Array<number>(n).fill(0);
    const fy = new Array<number>(n).fill(0);

    // Everyone is pulled home: people firmly, you gently (and not at all while held).
    for (let i = 0; i < n; i++) {
      const body = bodies[i]!;
      const k = i === 0 ? K_ME_HOME : K_HOME;
      fx[i]! += (body.homeX - body.x.value) * k;
      fy[i]! += (body.homeY - body.y.value) * k;
    }

    // Contact only: overlapping bodies push apart. No long-range forces, so the layout holds its shape.
    let bumpName: string | null = null;
    let bumped = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = bodies[i]!;
        const b = bodies[j]!;
        const dx = b.x.value - a.x.value;
        const dy = b.y.value - a.y.value;
        // Two people packed closer than touching on a crowded ring are at rest there, not colliding.
        const minDist =
          i === 0 ? a.r + b.r + 2 : Math.min(a.r + b.r + 2, Math.hypot(a.homeX - b.homeX, a.homeY - b.homeY) - 0.5);
        if (Math.abs(dx) > minDist || Math.abs(dy) > minDist) continue;
        const d = Math.max(0.5, Math.sqrt(dx * dx + dy * dy));
        if (d >= minDist) continue;
        const ux = dx / d;
        const uy = dy / d;
        const push = (minDist - d) * PUSH;
        fx[i]! -= ux * push;
        fy[i]! -= uy * push;
        fx[j]! += ux * push;
        fy[j]! += uy * push;
        const closing = (a.vx.value - b.vx.value) * ux + (a.vy.value - b.vy.value) * uy;
        if (closing > BUMP_SPEED && a.hit.value < 0.3 && b.hit.value < 0.3) {
          a.hit.value = 1;
          b.hit.value = 1;
          bumped = true;
          if (i === 0) bumpName = nodes[j - 1]?.displayName ?? null;
        }
      }
    }

    const decay = Math.exp(-DAMPING * dt);
    for (let i = 0; i < n; i++) {
      const body = bodies[i]!;
      body.hit.value = Math.max(0, body.hit.value - dt * 3);
      if (i === 0 && holding.value) {
        // The finger owns you; the gesture keeps your velocity current so contacts register as bumps.
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

  // Nearest person under a point, generously (a finger is wider than a node). -1 = nobody.
  const hitTest = (x: number, y: number): number => {
    'worklet';
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i]!;
      const d = Math.sqrt((body.x.value - x) ** 2 + (body.y.value - y) ** 2);
      if (d < body.r + 14 && d < bestD) {
        best = i;
        bestD = d;
      }
    }
    return best;
  };

  // Only you move. A drag that starts anywhere else does nothing (a tap there still selects).
  const pan = Gesture.Pan()
    .minDistance(4)
    .onBegin((event) => {
      const me = bodies[0]!;
      const onMe = Math.sqrt((me.x.value - event.x) ** 2 + (me.y.value - event.y) ** 2) < me.r + 18;
      holding.value = onMe;
      if (onMe) {
        me.held.value = withTiming(1, { duration: 120 });
        me.vx.value = 0;
        me.vy.value = 0;
      }
    })
    .onChange((event) => {
      if (!holding.value) return;
      const me = bodies[0]!;
      me.x.value = Math.max(me.r, Math.min(width - me.r, event.x));
      me.y.value = Math.max(me.r, Math.min(height - me.r, event.y));
      me.vx.value = event.velocityX;
      me.vy.value = event.velocityY;
    })
    .onFinalize((event) => {
      if (!holding.value) return;
      holding.value = false;
      const me = bodies[0]!;
      me.held.value = withTiming(0, { duration: 200 });
      // A fling carries a little (capped) before the pull home takes over.
      const cap = 900;
      me.vx.value = Math.max(-cap, Math.min(cap, event.velocityX * 0.4));
      me.vy.value = Math.max(-cap, Math.min(cap, event.velocityY * 0.4));
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
        {/* The rings everyone sits on, for orientation. */}
        {rings.map((radius) => (
          <View
            key={radius}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: cx - radius,
              top: cy - radius,
              width: radius * 2,
              height: radius * 2,
              borderRadius: radius,
              borderWidth: 1,
              borderColor: '#E4DDD0',
            }}
          />
        ))}
        {lines.map((line, index) => (
          <Edge key={`${line.a}-${line.b}-${index}`} from={bodies[line.a]!} to={bodies[line.b]!} line={line} />
        ))}
        {nodes.map((node, index) => (
          <Person key={node.id} node={node} body={bodies[index + 1]!} selected={node.id === selectedId} />
        ))}
        <Me body={bodies[0]!} />
      </View>
    </GestureDetector>
  );
}
