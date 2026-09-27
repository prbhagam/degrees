// Owner: Pranav (Groups, Activities & Chat) — Added Sep 26 (wave 4). The "Play" view of Your Circle: you are the
// draggable node at the centre; your 1st degree floats around you. Drag into someone and they get knocked away
// (spring back a moment later), with a haptic tap and their name. Pure client-side fun — nothing is written.
// Scope and v2 ideas: docs/PLAYGROUND.md.
import type { GraphResponse } from '@degrees/shared';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  makeMutable,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Muted } from '@/components/ui';
import { initials } from '@/components/ui';

type Node = GraphResponse['nodes'][number];

const SIZE = 320;
const R = 24; // node radius
const ME_R = 28;
const ORBIT = 118;
const SPRING = { damping: 12, stiffness: 140, mass: 0.8 };

interface Body {
  home: { x: number; y: number };
  dx: SharedValue<number>;
  dy: SharedValue<number>;
  hit: SharedValue<number>;
}

function polar(index: number, total: number): { x: number; y: number } {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  return { x: SIZE / 2 + ORBIT * Math.cos(angle), y: SIZE / 2 + ORBIT * Math.sin(angle) };
}

function FriendNode({ node, body }: { node: Node; body: Body }) {
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: body.dx.value },
      { translateY: body.dy.value },
      { scale: 1 + body.hit.value * 0.18 },
    ],
    borderColor: body.hit.value > 0.5 ? '#E8703A' : '#20201C',
  }));
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: body.home.x - R,
          top: body.home.y - R,
          width: R * 2,
          height: R * 2,
          borderRadius: R,
          backgroundColor: '#FFFFFF',
          borderWidth: 1.5,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Text style={{ fontFamily: 'PublicSans_700Bold', fontSize: 12, color: '#20201C' }}>{initials(node.displayName)}</Text>
    </Animated.View>
  );
}

export function BumpPlayground({ nodes }: { nodes: Node[] }) {
  const [bumped, setBumped] = useState<string | null>(null);
  const [bumps, setBumps] = useState(0);
  const meX = useSharedValue(0);
  const meY = useSharedValue(0);
  const dragging = useSharedValue(0);

  // One set of mutable offsets per friend, created outside React state so the gesture worklet can loop over them.
  const bodies = useMemo<Body[]>(
    () => nodes.map((_, index) => ({ home: polar(index, nodes.length), dx: makeMutable(0), dy: makeMutable(0), hit: makeMutable(0) })),
    // Positions only depend on how many people there are.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes.length],
  );
  useEffect(() => () => bodies.forEach((body) => { body.dx.value = 0; body.dy.value = 0; body.hit.value = 0; }), [bodies]);

  const onBump = (name: string) => {
    setBumped(name);
    setBumps((count) => count + 1);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const pan = Gesture.Pan()
    .onBegin(() => {
      dragging.value = withTiming(1, { duration: 120 });
    })
    .onChange((event) => {
      // Keep you inside the canvas.
      meX.value = Math.max(-SIZE / 2 + ME_R, Math.min(SIZE / 2 - ME_R, meX.value + event.changeX));
      meY.value = Math.max(-SIZE / 2 + ME_R, Math.min(SIZE / 2 - ME_R, meY.value + event.changeY));
      const mx = SIZE / 2 + meX.value;
      const my = SIZE / 2 + meY.value;
      for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i]!;
        const fx = body.home.x + body.dx.value;
        const fy = body.home.y + body.dy.value;
        const ddx = fx - mx;
        const ddy = fy - my;
        const dist = Math.sqrt(ddx * ddx + ddy * ddy);
        const minDist = R + ME_R;
        if (dist < minDist) {
          // Push them out along the line between you, a little past touching, then let the spring bring them home.
          const nx = dist === 0 ? 1 : ddx / dist;
          const ny = dist === 0 ? 0 : ddy / dist;
          const push = (minDist - dist) * 1.6 + 10;
          body.dx.value = withSequence(withTiming(body.dx.value + nx * push, { duration: 60 }), withSpring(0, SPRING));
          body.dy.value = withSequence(withTiming(body.dy.value + ny * push, { duration: 60 }), withSpring(0, SPRING));
          if (body.hit.value < 0.5) {
            body.hit.value = withSequence(withTiming(1, { duration: 80 }), withTiming(0, { duration: 500 }));
            runOnJS(onBump)(nodes[i]?.displayName ?? 'someone');
          }
        }
      }
    })
    .onFinalize(() => {
      dragging.value = withTiming(0, { duration: 200 });
      meX.value = withSpring(0, SPRING);
      meY.value = withSpring(0, SPRING);
    });

  const meStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: meX.value }, { translateY: meY.value }, { scale: 1 + dragging.value * 0.12 }],
    shadowOpacity: 0.15 + dragging.value * 0.2,
  }));

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: SIZE, height: SIZE }}>
        {/* Degree rings for context: the 1st-degree orbit and a faint 2nd beyond it. */}
        {[ORBIT * 2, ORBIT * 2 + 64].map((diameter, index) => (
          <View
            key={diameter}
            style={{
              position: 'absolute',
              left: SIZE / 2 - diameter / 2,
              top: SIZE / 2 - diameter / 2,
              width: diameter,
              height: diameter,
              borderRadius: diameter / 2,
              borderWidth: 1,
              borderColor: index === 0 ? '#E4DDD0' : '#F0EDE5',
            }}
          />
        ))}
        {nodes.map((node, index) => (
          <FriendNode key={node.id} node={node} body={bodies[index]!} />
        ))}
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              {
                position: 'absolute',
                left: SIZE / 2 - ME_R,
                top: SIZE / 2 - ME_R,
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
              meStyle,
            ]}
          >
            <Text style={{ fontFamily: 'PublicSans_700Bold', fontSize: 12, color: '#F7F3EC' }}>0°</Text>
          </Animated.View>
        </GestureDetector>
      </View>
      <View style={{ minHeight: 44, alignItems: 'center', marginTop: 8 }}>
        {bumped ? (
          <>
            <Text style={{ fontFamily: 'Fraunces_600SemiBold', fontSize: 18, color: '#20201C' }}>You bumped into {bumped}</Text>
            <Muted>{bumps} {bumps === 1 ? 'bump' : 'bumps'} so far</Muted>
          </>
        ) : (
          <Muted>Drag yourself around. Bump into people.</Muted>
        )}
      </View>
    </View>
  );
}
