// Owner: shared mobile scaffold (Charles). The Degrees mark: the "d" and the degree ring are the actual source
// artwork (assets/brand/d-glyph.png, degree-ring.png, cropped from assets/brand/degrees-logo-reference.png), not
// a redrawn approximation, so the brand mark is pixel-true to the design. The ring is always ember — it's tinted
// at render time (Image#tintColor), not baked into the asset — so the same source works for both colors.
//
// Static (`animated={false}`, headers/icon), it's the resting "d°" lockup: the ember ring top-right of the
// ascender, exactly as designed.
//
// Animated (loading indicator, and the tail of the splash), it runs a repeating three-beat cycle built from two
// "slots", each a single box that physically travels start-to-end across the whole morph window — not two shapes
// independently fading in place. Slot A carries the d's box from D_POSE to the park spot (opposite the ring's
// resting spot); slot B carries the ring's box from RING_TOPRIGHT to D_POSE. Each slot's box interpolates left,
// top, width AND height continuously, so the box itself is what's moving and resizing — the physical transform
// the user asked for. Inside each travelling box, the d image and the ring image are cross-dissolved (one
// fading 1->0, the other 0->1) so the box's *content* reads as morphing shape and color while the box itself is
// mid-flight, rather than a shape sliding away while an unrelated finished shape simply appears elsewhere. Once
// slot A reaches the park spot (now ring-shaped, ember), it sweeps counterclockwise exactly halfway round the
// letter to the ring's original top-right spot. Slot B settles at D_POSE (now d-shaped, ink) and stays. Then it
// repeats. `loop={false}` runs the cycle once and calls `onDone`, settled at the same resting pose it started from.
//
// Colour is always a static prop, never animated through useAnimatedStyle: Reanimated's fast path doesn't
// reliably drive Image#tintColor per frame. Each image keeps one fixed tint for its whole life (d always ink,
// ring always ember) — the color "change" is entirely the crossfade between an ink image and an ember image
// sharing the same moving box.
//
// Every useAnimatedStyle below is fully self-contained (no shared helper function that itself calls a hook, no
// worklet calling another worklet for the *whole* computation) — the eased-progress formula is repeated across
// styles as a result. That's deliberate: keep this file boringly literal so there's nothing subtle for the
// animation to fail to pick up.
import { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
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

// Slot A's destination once parked (before it sweeps home).
const PARK = polarBoxPlain(D_CENTER.x, D_CENTER.y, ORBIT_R, PARK_ANGLE, RING_SIZE);

const MORPH_MS = 900;
const SETTLE_MS = 400;
// The loading spinner (ui.tsx LoadingState) and the splash's tail must sweep at the same speed — both default to
// this and neither should override it with a different number.
export const ORBIT_MS = 1000;

export function DegreesMark({
  size = 48,
  animated = false,
  // Duration of the (half-)orbit sweep. The settle hold and the morph itself are fixed.
  orbitMs = ORBIT_MS,
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

  // Slot A's box: D_POSE -> PARK during the morph (position AND size interpolate together, so the box itself
  // shrinks from the d's rectangle to the ring's square as it travels), then orbits from PARK back to the ring's
  // resting spot.
  const slotABoxStyle = useAnimatedStyle(() => {
    'worklet';
    const t = Easing.inOut(Easing.cubic)(interpolate(master.value, [0, mMorph], [0, 1], Extrapolation.CLAMP));
    const width = D_POSE.width + t * (RING_SIZE - D_POSE.width);
    const height = D_POSE.height + t * (RING_SIZE - D_POSE.height);
    let left: number;
    let top: number;
    if (master.value < mMorph) {
      left = D_POSE.left + t * (PARK.left - D_POSE.left);
      top = D_POSE.top + t * (PARK.top - D_POSE.top);
    } else {
      const orbitT = Easing.inOut(Easing.cubic)(interpolate(master.value, [mMorph, mOrbit], [0, 1], Extrapolation.CLAMP));
      const angle = ((PARK_ANGLE - 180 * orbitT) * Math.PI) / 180;
      left = D_CENTER.x + ORBIT_R * Math.cos(angle) - width / 2;
      top = D_CENTER.y + ORBIT_R * Math.sin(angle) - height / 2;
    }
    return { position: 'absolute', left: left * size, top: top * size, width: width * size, height: height * size };
  });

  // Slot A's content: the d image fades out, the ring image fades in, both inside the same travelling box.
  const slotADStyle = useAnimatedStyle(() => {
    'worklet';
    const t = Easing.inOut(Easing.cubic)(interpolate(master.value, [0, mMorph], [0, 1], Extrapolation.CLAMP));
    return { opacity: 1 - t };
  });
  const slotARingStyle = useAnimatedStyle(() => {
    'worklet';
    const t = Easing.inOut(Easing.cubic)(interpolate(master.value, [0, mMorph], [0, 1], Extrapolation.CLAMP));
    return { opacity: t };
  });

  // Slot B's box: RING_TOPRIGHT -> D_POSE across the morph, then holds — this is what becomes the resting d.
  const slotBBoxStyle = useAnimatedStyle(() => {
    'worklet';
    const t = Easing.inOut(Easing.cubic)(interpolate(master.value, [0, mMorph], [0, 1], Extrapolation.CLAMP));
    const left = RING_TOPRIGHT.left + t * (D_POSE.left - RING_TOPRIGHT.left);
    const top = RING_TOPRIGHT.top + t * (D_POSE.top - RING_TOPRIGHT.top);
    const width = RING_TOPRIGHT.width + t * (D_POSE.width - RING_TOPRIGHT.width);
    const height = RING_TOPRIGHT.height + t * (D_POSE.height - RING_TOPRIGHT.height);
    return { position: 'absolute', left: left * size, top: top * size, width: width * size, height: height * size };
  });

  // Slot B's content: the ring image fades out, the d image fades in, both inside the same travelling box.
  const slotBRingStyle = useAnimatedStyle(() => {
    'worklet';
    const t = Easing.inOut(Easing.cubic)(interpolate(master.value, [0, mMorph], [0, 1], Extrapolation.CLAMP));
    return { opacity: 1 - t };
  });
  const slotBDStyle = useAnimatedStyle(() => {
    'worklet';
    const t = Easing.inOut(Easing.cubic)(interpolate(master.value, [0, mMorph], [0, 1], Extrapolation.CLAMP));
    return { opacity: t };
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
      {/* Slot A: the d's box physically travelling to the park spot (then orbiting home), its content dissolving
          from the d image to the ring image as it moves. */}
      <Animated.View style={slotABoxStyle}>
        <Animated.View style={[StyleSheet.absoluteFill, slotADStyle]}>
          <Image source={dGlyph} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, slotARingStyle]}>
          <Image source={ringGlyph} resizeMode="contain" tintColor={EMBER} style={{ width: '100%', height: '100%' }} />
        </Animated.View>
      </Animated.View>
      {/* Slot B: the ring's box physically travelling to D_POSE and settling there, its content dissolving from
          the ring image to the d image as it moves. */}
      <Animated.View style={slotBBoxStyle}>
        <Animated.View style={[StyleSheet.absoluteFill, slotBRingStyle]}>
          <Image source={ringGlyph} resizeMode="contain" tintColor={EMBER} style={{ width: '100%', height: '100%' }} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, slotBDStyle]}>
          <Image source={dGlyph} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}
