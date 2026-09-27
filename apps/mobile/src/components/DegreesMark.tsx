// Owner: shared mobile scaffold (Charles) — Added Sep 26 (wave 4). The Degrees mark, drawn in code: you at the
// centre, three degree rings around you, one node travelling the 1st-degree ring. Used static as a brand mark
// (headers) and animated as the loading indicator and the splash. Drawn in the app palette so it never clashes.
// This same geometry is rendered into assets/images/icon.png + splash-icon.png (scratch script, wave 5), so the
// app icon, the native splash image, and the in-app mark are one drawing.
// CHANGED Sep 26 (wave 5, Sahith): `animated` now also ripples the rings outward once per orbit (inner → outer,
// following the node round), so the loader and splash read as the logo coming alive rather than a spinner.
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

const INK = '#20201C';
const EMBER = '#E8703A';
const SAGE = '#5B7A6B';
const LINE = '#E4DDD0';

// A smooth hump centred on `at` (0..1 phase space, wrapping), zero elsewhere.
function hump(phase: number, at: number, width: number): number {
  'worklet';
  const d = Math.abs(((phase - at + 1.5) % 1) - 0.5);
  return Math.max(0, 1 - (d / width) ** 2);
}

function Ring({
  diameter,
  color,
  width,
  phase,
  at,
  amp,
}: {
  diameter: number;
  color: string;
  width: number;
  phase: SharedValue<number>;
  // Where in the orbit (0..1) this ring swells, and by how much.
  at: number;
  amp: number;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + amp * hump(phase.value, at, 0.22) }],
  }));
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          borderWidth: width,
          borderColor: color,
        },
        style,
      ]}
    />
  );
}

export function DegreesMark({
  size = 48,
  animated = false,
  // How long one orbit takes; slower reads calmer (loading), faster reads livelier (splash).
  orbitMs = 2400,
}: {
  size?: number;
  animated?: boolean;
  orbitMs?: number;
}) {
  // Orbit phase 0..1; the node's angle is phase * 360 and the rings ripple off it.
  const phase = useSharedValue(45 / 360);
  useEffect(() => {
    if (animated) {
      phase.value = 45 / 360;
      phase.value = withRepeat(withTiming(1 + 45 / 360, { duration: orbitMs, easing: Easing.linear }), -1);
    } else {
      cancelAnimation(phase);
      phase.value = withTiming(45 / 360, { duration: 300 });
    }
  }, [phase, animated, orbitMs]);

  const orbit = useAnimatedStyle(() => ({ transform: [{ rotate: `${(phase.value % 1) * 360}deg` }] }));
  const centreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: animated ? 1 + 0.08 * hump(phase.value % 1, 0.0, 0.18) : 1 }],
  }));

  const node = size * 0.18;
  const centre = size * 0.22;
  const thin = Math.max(1, size / 48);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* The ripple runs inner → outer, a beat after the node passes the top. Static marks have amp 0. */}
      <Ring diameter={size} color={LINE} width={thin} phase={phase} at={0.34} amp={animated ? 0.035 : 0} />
      <Ring diameter={size * 0.72} color={LINE} width={thin} phase={phase} at={0.22} amp={animated ? 0.05 : 0} />
      <Ring diameter={size * 0.44} color={SAGE} width={Math.max(1.5, size / 32)} phase={phase} at={0.1} amp={animated ? 0.07 : 0} />
      <Animated.View style={[{ width: centre, height: centre, borderRadius: centre / 2, backgroundColor: INK }, centreStyle]} />
      {/* The orbiting node sits at the top of a rotating square the size of the middle ring. */}
      <Animated.View style={[{ position: 'absolute', width: size * 0.72, height: size * 0.72, alignItems: 'center' }, orbit]}>
        <View style={{ width: node, height: node, borderRadius: node / 2, backgroundColor: EMBER, marginTop: -node / 2 }} />
      </Animated.View>
    </View>
  );
}

