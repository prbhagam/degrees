// Owner: shared mobile scaffold (Charles). The Degrees mark: the "d" and the degree ring are the actual source
// artwork (assets/brand/d-glyph.png, degree-ring.png, cropped from assets/brand/degrees-logo-reference.png), not
// a redrawn approximation, so the brand mark is pixel-true to the design. The ring is always ember — it's tinted
// at render time (Image#tintColor), not baked into the asset — so the same source works for both colors.
//
// Static (`animated={false}`, headers/icon), it's the resting "d°" lockup: the ember ring top-right of the
// ascender, exactly as designed.
//
// Animated (loading indicator, and the tail of the splash), it runs a repeating three-beat cycle: the ink "d"
// shrinks away as an ember ring fades in at a spot parked opposite the ring's resting spot (far enough past the
// letter that the orbit never crosses it), while an ember ring the shape of the old one grows and fades away as
// the new ink "d" fades in behind it — the fade is what reads as ink gradienting to ember and back, not a color
// animation on either shape — then the parked ring sweeps counterclockwise exactly halfway round the letter,
// landing back at the ring's original top-right spot — then it repeats. `loop={false}` runs the cycle once and
// calls `onDone`, settled at the same resting pose it started from.
//
// Colour is always a static prop, never animated through useAnimatedStyle: Reanimated's fast path doesn't
// reliably drive Image#tintColor per frame, so every element keeps one fixed tint for its whole lifetime and
// the gradient is an illusion of the crossfade.
//
// Every useAnimatedStyle below is fully self-contained (no shared helper function that itself calls a hook, no
// worklet calling another worklet for the *whole* computation) — some math is repeated between the two
// transitional styles as a result. That's deliberate: keep this file boringly literal so there's nothing subtle
// for the animation to fail to pick up.
import { useEffect } from 'react';
import { Image, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Extrapolation,
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
const RING_SIZE = RING_TOPRIGHT.width;

// The orbit circle: centred on the d, radius equal to the ring's own resting distance from that centre, so the
// ring's top-right pose sits exactly on it. That radius already clears the d's bounding half-diagonal (0.5163)
// with margin, so a ring travelling anywhere on this circle never crosses the letter.
const RING_DX = RING_TOPRIGHT.left + RING_SIZE / 2 - D_CENTER.x;
const RING_DY = RING_TOPRIGHT.top + RING_SIZE / 2 - D_CENTER.y;
const ORBIT_R = Math.hypot(RING_DX, RING_DY);
const TOPRIGHT_ANGLE = (Math.atan2(RING_DY, RING_DX) * 180) / Math.PI;
// The park spot is the point opposite the ring's resting spot on that same circle — a half-orbit away.
const PARK_ANGLE = TOPRIGHT_ANGLE + 180;

function polarBoxPlain(cx: number, cy: number, radius: number, angleDeg: number, itemSize: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { left: cx + radius * Math.cos(rad) - itemSize / 2, top: cy + radius * Math.sin(rad) - itemSize / 2, width: itemSize, height: itemSize };
}

const PARK = polarBoxPlain(D_CENTER.x, D_CENTER.y, ORBIT_R, PARK_ANGLE, RING_SIZE);
// Transitional (fading-out) shapes: the shrinking d collapses toward the park spot, matching the size the stable
// ring will fade in at there; the growing ring swells past the d's own footprint before it's fully faded, so the
// crossfade never shows a gap.
const D_SHRUNK = { left: PARK.left, top: PARK.top, width: RING_SIZE, height: RING_SIZE };
const RING_GROWN = { left: D_CENTER.x - D_POSE.height / 2, top: D_CENTER.y - D_POSE.height / 2, width: D_POSE.height, height: D_POSE.height };

const MORPH_MS = 900;
const SETTLE_MS = 400;
// The morph is two distinct beats, not one blended crossfade: first the departing shape physically moves and
// shrinks/grows at FULL opacity (nothing else on screen to dilute it, so the motion is unmistakable) — only
// once it's finished travelling does it fade out, while the arriving shape fades in at its fixed destination.
const MOVE_FRACTION = 0.6;

export function DegreesMark({
  size = 48,
  animated = false,
  // Duration of the (half-)orbit sweep. The settle hold and the morph itself are fixed.
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

  // Transitional: the old ink d, moving from D_POSE to the park spot at full opacity, then fading out.
  const dShrinkingStyle = useAnimatedStyle(() => {
    'worklet';
    const raw = interpolate(master.value, [0, mMorph], [0, 1], Extrapolation.CLAMP);
    const moveT = Easing.inOut(Easing.cubic)(interpolate(raw, [0, MOVE_FRACTION], [0, 1], Extrapolation.CLAMP));
    const fadeT = Easing.inOut(Easing.cubic)(interpolate(raw, [MOVE_FRACTION, 1], [0, 1], Extrapolation.CLAMP));
    const left = D_POSE.left + moveT * (D_SHRUNK.left - D_POSE.left);
    const top = D_POSE.top + moveT * (D_SHRUNK.top - D_POSE.top);
    const width = D_POSE.width + moveT * (D_SHRUNK.width - D_POSE.width);
    const height = D_POSE.height + moveT * (D_SHRUNK.height - D_POSE.height);
    return {
      position: 'absolute',
      left: left * size,
      top: top * size,
      width: width * size,
      height: height * size,
      opacity: 1 - fadeT,
    };
  });

  // Transitional: the old ember ring, swelling from RING_TOPRIGHT toward the d's footprint, then fading out.
  const ringGrowingStyle = useAnimatedStyle(() => {
    'worklet';
    const raw = interpolate(master.value, [0, mMorph], [0, 1], Extrapolation.CLAMP);
    const moveT = Easing.inOut(Easing.cubic)(interpolate(raw, [0, MOVE_FRACTION], [0, 1], Extrapolation.CLAMP));
    const fadeT = Easing.inOut(Easing.cubic)(interpolate(raw, [MOVE_FRACTION, 1], [0, 1], Extrapolation.CLAMP));
    const left = RING_TOPRIGHT.left + moveT * (RING_GROWN.left - RING_TOPRIGHT.left);
    const top = RING_TOPRIGHT.top + moveT * (RING_GROWN.top - RING_TOPRIGHT.top);
    const width = RING_TOPRIGHT.width + moveT * (RING_GROWN.width - RING_TOPRIGHT.width);
    const height = RING_TOPRIGHT.height + moveT * (RING_GROWN.height - RING_TOPRIGHT.height);
    return {
      position: 'absolute',
      left: left * size,
      top: top * size,
      width: width * size,
      height: height * size,
      opacity: 1 - fadeT,
    };
  });

  // Stable: the new ink d, fixed at D_POSE, fading in once the departing shapes finish moving.
  const dFadeInStyle = useAnimatedStyle(() => {
    'worklet';
    const raw = interpolate(master.value, [0, mMorph], [0, 1], Extrapolation.CLAMP);
    const fadeT = Easing.inOut(Easing.cubic)(interpolate(raw, [MOVE_FRACTION, 1], [0, 1], Extrapolation.CLAMP));
    return {
      position: 'absolute',
      left: D_POSE.left * size,
      top: D_POSE.top * size,
      width: D_POSE.width * size,
      height: D_POSE.height * size,
      opacity: fadeT,
    };
  });

  // Stable: the new ember ring — fades in at the park spot once the departing shapes finish moving, then sweeps
  // counterclockwise halfway round the letter to its resting spot.
  const ringOrbitStyle = useAnimatedStyle(() => {
    'worklet';
    const raw = interpolate(master.value, [0, mMorph], [0, 1], Extrapolation.CLAMP);
    const fadeT = Easing.inOut(Easing.cubic)(interpolate(raw, [MOVE_FRACTION, 1], [0, 1], Extrapolation.CLAMP));
    const orbitT = Easing.inOut(Easing.cubic)(interpolate(master.value, [mMorph, mOrbit], [0, 1], Extrapolation.CLAMP));
    const angle = ((PARK_ANGLE - 180 * orbitT) * Math.PI) / 180;
    const cx = D_CENTER.x * size;
    const cy = D_CENTER.y * size;
    const r = ORBIT_R * size;
    const ringSize = RING_SIZE * size;
    return {
      position: 'absolute',
      left: cx + r * Math.cos(angle) - ringSize / 2,
      top: cy + r * Math.sin(angle) - ringSize / 2,
      width: ringSize,
      height: ringSize,
      opacity: fadeT,
    };
  });

  if (!animated) {
    return (
      <View style={{ width: size, height: size }}>
        <Image source={dGlyph} resizeMode="contain" style={{ position: 'absolute', left: D_POSE.left * size, top: D_POSE.top * size, width: D_POSE.width * size, height: D_POSE.height * size }} />
        <Image source={ringGlyph} resizeMode="contain" tintColor={EMBER} style={{ position: 'absolute', left: RING_TOPRIGHT.left * size, top: RING_TOPRIGHT.top * size, width: RING_TOPRIGHT.width * size, height: RING_TOPRIGHT.height * size }} />
      </View>
    );
  }

  return (
    <View style={{ width: size, height: size }}>
      {/* Transitional: the old ink d shrinking away toward the park spot. Animated.View carries the box/opacity
          (the pattern proven to actually move on screen); the Image inside is a plain, static child. */}
      <Animated.View style={dShrinkingStyle}>
        <Image source={dGlyph} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
      </Animated.View>
      {/* Transitional: the old ember ring swelling toward the d's footprint. */}
      <Animated.View style={ringGrowingStyle}>
        <Image source={ringGlyph} resizeMode="contain" tintColor={EMBER} style={{ width: '100%', height: '100%' }} />
      </Animated.View>
      {/* Stable: the new d, ink, fixed at D_POSE, fading in. */}
      <Animated.View style={dFadeInStyle}>
        <Image source={dGlyph} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
      </Animated.View>
      {/* Stable: the new ring, ember, parked then sweeping halfway home. */}
      <Animated.View style={ringOrbitStyle}>
        <Image source={ringGlyph} resizeMode="contain" tintColor={EMBER} style={{ width: '100%', height: '100%' }} />
      </Animated.View>
    </View>
  );
}
