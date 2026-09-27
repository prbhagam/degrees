// Owner: shared mobile scaffold (Charles). The Degrees mark: the "d" and the degree ring are the actual source
// artwork (assets/brand/d-glyph.png, degree-ring.png, cropped from assets/brand/degrees-logo-reference.png), not
// a redrawn approximation, so the brand mark is pixel-true to the design. The ring is always ember — it's tinted
// at render time (Image#tintColor), not baked into the asset — so the same source works for both colors.
//
// Static (`animated={false}`, headers/icon), it's the resting "d°" lockup: the ember ring top-right of the
// ascender, exactly as designed.
//
// Animated (loading indicator, and the tail of the splash), it runs a repeating three-beat cycle: the ink "d"
// shrinks and gradients ink -> ember as it fades into a ring parked opposite the ring's resting spot (far enough
// past the letter that the orbit never crosses it), while the ring simultaneously grows and gradients ember ->
// ink as it fades into the new "d" — then that parked ring sweeps counterclockwise exactly halfway round the
// letter, landing back at the ring's original top-right spot — then it repeats. `loop={false}` runs the cycle
// once and calls `onDone`, settled at the same resting pose it started from.
import { useEffect } from 'react';
import { Image, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  interpolateColor,
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

function polarBox(cx: number, cy: number, radius: number, angleDeg: number, itemSize: number) {
  'worklet';
  const rad = (angleDeg * Math.PI) / 180;
  return { left: cx + radius * Math.cos(rad) - itemSize / 2, top: cy + radius * Math.sin(rad) - itemSize / 2, width: itemSize, height: itemSize };
}

const PARK = polarBox(D_CENTER.x, D_CENTER.y, ORBIT_R, PARK_ANGLE, RING_SIZE);
// Transitional (fading-out) shapes: the shrinking d collapses toward the park spot, matching the size the stable
// ring will fade in at there; the growing ring swells past the d's own footprint before it's fully faded, so the
// crossfade never shows a gap.
const D_SHRUNK = { left: PARK.left, top: PARK.top, width: RING_SIZE, height: RING_SIZE };
const RING_GROWN = { left: D_CENTER.x - D_POSE.height / 2, top: D_CENTER.y - D_POSE.height / 2, width: D_POSE.height, height: D_POSE.height };

const MORPH_MS = 550;
const SETTLE_MS = 400;
const EASE = Easing.inOut(Easing.cubic);

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

  const px = (frac: number) => {
    'worklet';
    return frac * size;
  };
  // Eased, clamped progress through the morph (0..1) — held at 0 before it starts, at 1 after it ends.
  const morphT = () => {
    'worklet';
    return EASE(interpolate(master.value, [0, mMorph], [0, 1], Extrapolation.CLAMP));
  };

  // Transitional element: box + opacity + tint all driven by the same eased morph progress, fading OUT as it
  // travels from `from` toward `to` and gradients from `colorFrom` to `colorTo`.
  const useTransitionalStyle = (from: typeof D_POSE, to: typeof D_POSE, colorFrom: string, colorTo: string) =>
    useAnimatedStyle(() => {
      const t = morphT();
      return {
        position: 'absolute',
        left: px(from.left + t * (to.left - from.left)),
        top: px(from.top + t * (to.top - from.top)),
        width: px(from.width + t * (to.width - from.width)),
        height: px(from.height + t * (to.height - from.height)),
        opacity: 1 - t,
        tintColor: interpolateColor(t, [0, 1], [colorFrom, colorTo]),
      };
    });
  const fadeInStyle = useAnimatedStyle(() => ({ opacity: morphT() }));

  // The stable ring: fades in ember at PARK during the morph, then sweeps halfway to its resting spot.
  const ringOrbitStyle = useAnimatedStyle(() => {
    const orbitT = EASE(interpolate(master.value, [mMorph, mOrbit], [0, 1], Extrapolation.CLAMP));
    const angle = PARK_ANGLE - 180 * orbitT;
    const box = polarBox(px(D_CENTER.x), px(D_CENTER.y), px(ORBIT_R), angle, px(RING_SIZE));
    return { position: 'absolute', ...box, opacity: morphT(), tintColor: EMBER };
  });

  const dShrinkingStyle = useTransitionalStyle(D_POSE, D_SHRUNK, INK, EMBER);
  const ringGrowingStyle = useTransitionalStyle(RING_TOPRIGHT, RING_GROWN, EMBER, INK);

  if (!animated) {
    return (
      <View style={{ width: size, height: size }}>
        <Image source={dGlyph} resizeMode="contain" style={{ position: 'absolute', left: px(D_POSE.left), top: px(D_POSE.top), width: px(D_POSE.width), height: px(D_POSE.height) }} />
        <Image source={ringGlyph} resizeMode="contain" tintColor={EMBER} style={{ position: 'absolute', left: px(RING_TOPRIGHT.left), top: px(RING_TOPRIGHT.top), width: px(RING_TOPRIGHT.width), height: px(RING_TOPRIGHT.height) }} />
      </View>
    );
  }

  return (
    <View style={{ width: size, height: size }}>
      {/* Transitional: the old d shrinking away, gradienting ink -> ember, toward the park spot. */}
      <Animated.Image source={dGlyph} resizeMode="contain" style={dShrinkingStyle} />
      {/* Transitional: the old ring swelling, gradienting ember -> ink, toward the d's footprint. */}
      <Animated.Image source={ringGlyph} resizeMode="contain" style={ringGrowingStyle} />
      {/* Stable: the new d, ink, fixed at D_POSE, fading in. */}
      <Animated.Image
        source={dGlyph}
        resizeMode="contain"
        style={[{ position: 'absolute', left: px(D_POSE.left), top: px(D_POSE.top), width: px(D_POSE.width), height: px(D_POSE.height) }, fadeInStyle]}
      />
      {/* Stable: the new ring, ember, parked then sweeping halfway home. */}
      <Animated.Image source={ringGlyph} resizeMode="contain" style={ringOrbitStyle} />
    </View>
  );
}
