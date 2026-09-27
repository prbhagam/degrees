// Owner: shared mobile scaffold (Charles). The Degrees mark: the "d" and the degree ring are the actual source
// artwork (assets/brand/d-glyph.png, degree-ring.png, cropped from assets/brand/degrees-logo-reference.png), not
// a redrawn approximation, so the brand mark is pixel-true to the design. The ring is always ember — it's tinted
// at render time (Image#tintColor), not baked into the asset — and no ink-coloured or d-shaped version of it is
// ever drawn; only the ring glyph moves.
//
// Static (`animated={false}`, headers/icon), it's the resting "d°" lockup: the ember ring top-right of the
// ascender, exactly as designed.
//
// Animated (loading indicator, and the tail of the splash), the "d" never moves — only the ring orbits it,
// pivoting on the d's centre at the exact radius and starting angle that put the ring at its own resting spot
// (RING_TOPRIGHT), so the hand-off from the static pose is pixel-for-pixel. It sweeps one full counterclockwise
// lap and lands back at that same top-right spot. A comet trail of six fixed-size nodes rides behind the ring,
// rigidly carried by the same rotating arm (so their angular spacing never changes), but each node's opacity is
// gated by how far the ring has travelled: `trailReach = min(travelled, 360 - travelled)` grows from 0 as the
// ring first departs (the trail "leaves behind" nodes one at a time) and shrinks back to 0 as the ring closes
// the last stretch home (the trail "feeds into" the ring), so the trail is fully gone by the moment the ring
// arrives — never a trail at rest. Looping, it holds at rest (no trail) for a beat, then laps again. `loop=false`
// runs the lap once and calls `onDone`, settled at the same resting pose it started from, no trail.
import { useEffect } from 'react';
import { Image, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const dGlyph = require('../../assets/brand/d-glyph.png');
const ringGlyph = require('../../assets/brand/degree-ring.png');

export const INK = '#20201C';
export const EMBER = '#E8703A';

// Measured from the source mark, as fractions of `size`. Exported so AnimatedSplash's typing reveal can line up
// with exactly the same boxes before handing off to this component.
export const D_POSE = { left: 0.04, top: 0.166, width: 0.6286, height: 0.8192 };
export const RING_TOPRIGHT = { left: 0.7218, top: 0.0148, width: 0.2382, height: 0.2382 };
const D_CENTER = { x: 0.3543, y: 0.5756 };

// The orbit circle: centred on the d, radius and angle chosen so the ring's own resting spot sits exactly on it
// at angle 0 of the lap — the animated pivot is the same geometry as the static lockup, not a separate guess.
const RING_DX = RING_TOPRIGHT.left + RING_TOPRIGHT.width / 2 - D_CENTER.x;
const RING_DY = RING_TOPRIGHT.top + RING_TOPRIGHT.height / 2 - D_CENTER.y;
const ORBIT_R = Math.hypot(RING_DX, RING_DY);
const TOPRIGHT_ANGLE = (Math.atan2(RING_DY, RING_DX) * 180) / Math.PI;

// The trail: six fixed-size nodes, each LOAD_STEP degrees further behind the ring than the last (hand-tuned,
// ported from the mark's original orbiting design). FADE_DEG is how many degrees of travel each node takes to
// fade in (or out), so the trail grows and shrinks smoothly rather than nodes popping on and off.
const LOAD_STEP = 14;
const LOAD_TRAIL_SIZES = [0.09, 0.0775, 0.0675, 0.0575, 0.0475, 0.04];
const FADE_DEG = 12;
const SETTLE_MS = 550;
// The loading spinner (ui.tsx LoadingState) and the splash's tail must sweep at the same speed — both default to
// this and neither should override it with a different number.
export const ORBIT_MS = 1600;

function polarBox(radius: number, angleDeg: number, w: number, h: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { left: radius + radius * Math.cos(rad) - w / 2, top: radius + radius * Math.sin(rad) - h / 2 };
}

export function DegreesMark({
  size = 48,
  animated = false,
  // Duration of one full lap. The settle hold between laps is fixed.
  orbitMs = ORBIT_MS,
  // false runs the lap exactly once and calls onDone when it settles.
  loop = true,
  onDone,
}: {
  size?: number;
  animated?: boolean;
  orbitMs?: number;
  loop?: boolean;
  onDone?: () => void;
}) {
  // Sweeps 0 -> -360 (counterclockwise) from the resting angle, then (looping) holds at 0 before lapping again.
  const lap = useSharedValue(0);
  useEffect(() => {
    if (!animated) {
      cancelAnimation(lap);
      lap.value = 0;
      return;
    }
    if (loop) {
      lap.value = withRepeat(
        withSequence(
          withTiming(-360, { duration: orbitMs, easing: Easing.inOut(Easing.cubic) }),
          withDelay(SETTLE_MS, withTiming(0, { duration: 0 })),
        ),
        -1,
      );
    } else {
      lap.value = withTiming(-360, { duration: orbitMs, easing: Easing.inOut(Easing.cubic) }, (finished) => {
        if (finished && onDone) runOnJS(onDone)();
      });
    }
  }, [animated, loop, lap, onDone, orbitMs]);

  const armStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${TOPRIGHT_ANGLE + lap.value}deg` }],
  }));

  // How far the ring has travelled this lap (0 at rest/departure, 360 back at rest) — degrees, always >= 0.
  const trailNode1Style = useAnimatedStyle(() => {
    'worklet';
    const travelled = -lap.value;
    const trailReach = Math.min(travelled, 360 - travelled);
    return { opacity: interpolate(trailReach, [1 * LOAD_STEP - FADE_DEG, 1 * LOAD_STEP], [0, 1], Extrapolation.CLAMP) };
  });
  const trailNode2Style = useAnimatedStyle(() => {
    'worklet';
    const travelled = -lap.value;
    const trailReach = Math.min(travelled, 360 - travelled);
    return { opacity: interpolate(trailReach, [2 * LOAD_STEP - FADE_DEG, 2 * LOAD_STEP], [0, 1], Extrapolation.CLAMP) };
  });
  const trailNode3Style = useAnimatedStyle(() => {
    'worklet';
    const travelled = -lap.value;
    const trailReach = Math.min(travelled, 360 - travelled);
    return { opacity: interpolate(trailReach, [3 * LOAD_STEP - FADE_DEG, 3 * LOAD_STEP], [0, 1], Extrapolation.CLAMP) };
  });
  const trailNode4Style = useAnimatedStyle(() => {
    'worklet';
    const travelled = -lap.value;
    const trailReach = Math.min(travelled, 360 - travelled);
    return { opacity: interpolate(trailReach, [4 * LOAD_STEP - FADE_DEG, 4 * LOAD_STEP], [0, 1], Extrapolation.CLAMP) };
  });
  const trailNode5Style = useAnimatedStyle(() => {
    'worklet';
    const travelled = -lap.value;
    const trailReach = Math.min(travelled, 360 - travelled);
    return { opacity: interpolate(trailReach, [5 * LOAD_STEP - FADE_DEG, 5 * LOAD_STEP], [0, 1], Extrapolation.CLAMP) };
  });
  const trailNode6Style = useAnimatedStyle(() => {
    'worklet';
    const travelled = -lap.value;
    const trailReach = Math.min(travelled, 360 - travelled);
    return { opacity: interpolate(trailReach, [6 * LOAD_STEP - FADE_DEG, 6 * LOAD_STEP], [0, 1], Extrapolation.CLAMP) };
  });
  const trailNodeStyles = [trailNode1Style, trailNode2Style, trailNode3Style, trailNode4Style, trailNode5Style, trailNode6Style];

  if (!animated) {
    return (
      <View style={{ width: size, height: size }}>
        <Image source={dGlyph} resizeMode="contain" style={{ position: 'absolute', left: D_POSE.left * size, top: D_POSE.top * size, width: D_POSE.width * size, height: D_POSE.height * size }} />
        <Image source={ringGlyph} resizeMode="contain" tintColor={EMBER} style={{ position: 'absolute', left: RING_TOPRIGHT.left * size, top: RING_TOPRIGHT.top * size, width: RING_TOPRIGHT.width * size, height: RING_TOPRIGHT.height * size }} />
      </View>
    );
  }

  const R = ORBIT_R * size;
  const armLeft = D_CENTER.x * size - R;
  const armTop = D_CENTER.y * size - R;
  const ringW = RING_TOPRIGHT.width * size;
  const ringH = RING_TOPRIGHT.height * size;
  // Local arm coordinates, angle 0 = directly along +x from the pivot; the armStyle rotation carries this to the
  // ring's actual resting angle at rest (lap.value 0) and sweeps it from there.
  const ringPos = polarBox(R, 0, ringW, ringH);
  const trail = LOAD_TRAIL_SIZES.map((fraction, i) => ({
    ...polarBox(R, (i + 1) * LOAD_STEP, size * fraction, size * fraction),
    size: size * fraction,
  }));

  return (
    <View style={{ width: size, height: size }}>
      <Image
        source={dGlyph}
        resizeMode="contain"
        style={{ position: 'absolute', left: D_POSE.left * size, top: D_POSE.top * size, width: D_POSE.width * size, height: D_POSE.height * size }}
      />
      <Animated.View style={[{ position: 'absolute', left: armLeft, top: armTop, width: R * 2, height: R * 2 }, armStyle]}>
        <Image source={ringGlyph} resizeMode="contain" tintColor={EMBER} style={{ position: 'absolute', left: ringPos.left, top: ringPos.top, width: ringW, height: ringH }} />
        {trail.map((node, i) => (
          <Animated.View
            key={i}
            style={[
              {
                position: 'absolute',
                left: node.left,
                top: node.top,
                width: node.size,
                height: node.size,
                borderRadius: node.size / 2,
                backgroundColor: EMBER,
              },
              trailNodeStyles[i],
            ]}
          />
        ))}
      </Animated.View>
    </View>
  );
}
