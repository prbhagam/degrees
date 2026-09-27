// Owner: shared mobile scaffold (Charles) — Added Sep 26 (wave 4). The Degrees mark, drawn in code: you at the
// centre, three degree rings around you, one node travelling the 1st-degree ring. Used static as a brand mark
// (headers) and animated as the loading indicator and the splash. Drawn in the app palette so it never clashes.
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const INK = '#20201C';
const EMBER = '#E8703A';
const SAGE = '#5B7A6B';
const LINE = '#E4DDD0';

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
  const angle = useSharedValue(45);
  useEffect(() => {
    if (animated) {
      angle.value = 0;
      angle.value = withRepeat(withTiming(360, { duration: orbitMs, easing: Easing.linear }), -1);
    } else {
      cancelAnimation(angle);
      angle.value = withTiming(45, { duration: 300 });
    }
  }, [angle, animated, orbitMs]);

  const orbit = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }] }));

  const ring = (fraction: number, color: string, width: number) => {
    const diameter = size * fraction;
    return (
      <View
        key={fraction}
        style={{
          position: 'absolute',
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          borderWidth: width,
          borderColor: color,
        }}
      />
    );
  };
  const node = size * 0.18;
  const centre = size * 0.22;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {ring(1, LINE, Math.max(1, size / 48))}
      {ring(0.72, LINE, Math.max(1, size / 48))}
      {ring(0.44, SAGE, Math.max(1.5, size / 32))}
      <View style={{ width: centre, height: centre, borderRadius: centre / 2, backgroundColor: INK }} />
      {/* The orbiting node sits at the top of a rotating square the size of the middle ring. */}
      <Animated.View style={[{ position: 'absolute', width: size * 0.72, height: size * 0.72, alignItems: 'center' }, orbit]}>
        <View
          style={{
            width: node,
            height: node,
            borderRadius: node / 2,
            backgroundColor: EMBER,
            marginTop: -node / 2,
          }}
        />
      </Animated.View>
    </View>
  );
}
