// Owner: shared mobile scaffold (Charles). The Degrees mark: the "d" and the degree ring are the actual source
// artwork (assets/brand/d-glyph.png, degree-ring.png, cropped from assets/brand/degrees-logo-reference.png), not
// a redrawn approximation, so the brand mark is pixel-true to the design.
//
// Static (`animated={false}`, headers/icon), it's the resting "d°" lockup: the ring top-right of the ascender,
// exactly as designed.
//
// Animated (loading indicator, and the tail of the splash), it runs a repeating three-beat cycle: the "d"
// shrinks and fades into a small ring parked past the letter's bottom-left, while the ring simultaneously grows
// and fades into the new "d" — then that small ring whips counterclockwise once around the whole letter and
// settles back at the park position — then it repeats. `loop={false}` runs the cycle once and calls `onDone`.
import { useEffect } from 'react';
import { Image, View } from 'react-native';
import Animated, {
  Extrapolation,
  cancelAnimation,
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const dGlyph = require('../../assets/brand/d-glyph.png');
const ringGlyph = require('../../assets/brand/degree-ring.png');

// Measured from the source mark, as fractions of `size`.
const D_POSE = { left: 0.04, top: 0.166, width: 0.6286, height: 0.8192 };
const RING_TOPRIGHT = { left: 0.7218, top: 0.0148, width: 0.2382, height: 0.2382 };
const D_CENTER = { x: 0.3543, y: 0.5756 };

// The loop's parked ring: far enough past the d's bottom-left corner that a full orbit at this radius never
// crosses the letter (radius exceeds the d's own bounding half-diagonal, 0.5163, with margin to spare).
const PARK_R = 0.64;
const PARK_ANGLE = 140; // degrees; 0 = east, 90 = south — 140 sits down-and-left of centre.
const PARK_SIZE = 0.16;
const PARK = {
  left: D_CENTER.x + PARK_R * Math.cos((PARK_ANGLE * Math.PI) / 180) - PARK_SIZE / 2,
  top: D_CENTER.y + PARK_R * Math.sin((PARK_ANGLE * Math.PI) / 180) - PARK_SIZE / 2,
  width: PARK_SIZE,
  height: PARK_SIZE,
};
// Transitional (fading-out) shapes: the shrinking d collapses toward the park spot; the growing ring swells
// toward — and past — the d's own footprint before it's fully faded, so the crossfade never shows a gap.
const D_SHRUNK = { left: PARK.left, top: PARK.top, width: PARK_SIZE, height: PARK_SIZE };
const RING_GROWN = {
  left: D_CENTER.x - D_POSE.height / 2,
  top: D_CENTER.y - D_POSE.height / 2,
  width: D_POSE.height,
  height: D_POSE.height,
};

const MORPH_MS = 550;
const SETTLE_MS = 400;

function polarBox(cx: number, cy: number, radius: number, angleDeg: number, itemSize: number) {
  'worklet';
  const rad = (angleDeg * Math.PI) / 180;
  const size = itemSize;
  return {
    left: cx + radius * Math.cos(rad) - size / 2,
    top: cy + radius * Math.sin(rad) - size / 2,
    width: size,
    height: size,
  };
}

export function DegreesMark({
  size = 48,
  animated = false,
  // Duration of the orbit sweep (the settle hold and the morph itself are fixed).
  orbitMs = 2400,
  // false runs the shrink/grow/orbit cycle exactly once and calls onDone when it settles.
  loop = true,
  onDone,
}: {
  size?: number;
  animated?: boolean;
  orbitMs?: number;
  loop?: boolean;
  onDone?: () => void;
}) {
  const totalMs = MORPH_MS + orbitMs + SETTLE_MS;
  const mMorph = MORPH_MS / totalMs;
  const mOrbit = (MORPH_MS + orbitMs) / totalMs;

  const master = useSharedValue(0);
  useEffect(() => {
    if (!animated) {
      cancelAnimation(master);
      master.value = 0;
      return;
    }
    if (loop) {
      master.value = withRepeat(withTiming(1, { duration: totalMs, easing: Easing.linear }), -1);
    } else {
      master.value = withTiming(1, { duration: totalMs, easing: Easing.linear }, (finished) => {
        if (finished && onDone) runOnJS(onDone)();
      });
    }
  }, [animated, loop, master, onDone, totalMs]);

  const px = (frac: number) => {
    'worklet';
    return frac * size;
  };
  const useBoxStyle = (from: typeof D_POSE, to: typeof D_POSE) =>
    useAnimatedStyle(() => ({
      position: 'absolute',
      left: px(interpolate(master.value, [0, mMorph], [from.left, to.left], Extrapolation.CLAMP)),
      top: px(interpolate(master.value, [0, mMorph], [from.top, to.top], Extrapolation.CLAMP)),
      width: px(interpolate(master.value, [0, mMorph], [from.width, to.width], Extrapolation.CLAMP)),
      height: px(interpolate(master.value, [0, mMorph], [from.height, to.height], Extrapolation.CLAMP)),
    }));
  const fadeOutStyle = useAnimatedStyle(() => ({
    opacity: interpolate(master.value, [0, mMorph], [1, 0], Extrapolation.CLAMP),
  }));
  const fadeInStyle = useAnimatedStyle(() => ({
    opacity: interpolate(master.value, [0, mMorph], [0, 1], Extrapolation.CLAMP),
  }));

  // The stable ring: fades in at PARK during the morph, then orbits the d, then holds at PARK again.
  const ringOrbitStyle = useAnimatedStyle(() => {
    const angle = interpolate(
      master.value,
      [0, mMorph, mOrbit, 1],
      [PARK_ANGLE, PARK_ANGLE, PARK_ANGLE - 360, PARK_ANGLE - 360],
      Extrapolation.CLAMP,
    );
    const box = polarBox(px(D_CENTER.x), px(D_CENTER.y), px(PARK_R), angle, px(PARK_SIZE));
    return { position: 'absolute', ...box, opacity: interpolate(master.value, [0, mMorph], [0, 1], Extrapolation.CLAMP) };
  });

  const dShrinkingStyle = useBoxStyle(D_POSE, D_SHRUNK);
  const ringGrowingStyle = useBoxStyle(RING_TOPRIGHT, RING_GROWN);

  if (!animated) {
    return (
      <View style={{ width: size, height: size }}>
        <Image source={dGlyph} resizeMode="contain" style={{ position: 'absolute', left: px(D_POSE.left), top: px(D_POSE.top), width: px(D_POSE.width), height: px(D_POSE.height) }} />
        <Image source={ringGlyph} resizeMode="contain" style={{ position: 'absolute', left: px(RING_TOPRIGHT.left), top: px(RING_TOPRIGHT.top), width: px(RING_TOPRIGHT.width), height: px(RING_TOPRIGHT.height) }} />
      </View>
    );
  }

  return (
    <View style={{ width: size, height: size }}>
      {/* Transitional: the old d shrinking away toward the park spot. */}
      <Animated.View style={[dShrinkingStyle, fadeOutStyle]}>
        <Image source={dGlyph} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
      </Animated.View>
      {/* Transitional: the old ring swelling toward the d's footprint. */}
      <Animated.View style={[ringGrowingStyle, fadeOutStyle]}>
        <Image source={ringGlyph} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
      </Animated.View>
      {/* Stable: the new d, fixed at D_POSE, fading in. */}
      <Animated.View style={[{ position: 'absolute', left: px(D_POSE.left), top: px(D_POSE.top), width: px(D_POSE.width), height: px(D_POSE.height) }, fadeInStyle]}>
        <Image source={dGlyph} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
      </Animated.View>
      {/* Stable: the new ring, parked then orbiting. */}
      <Animated.View style={ringOrbitStyle}>
        <Image source={ringGlyph} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
      </Animated.View>
    </View>
  );
}
