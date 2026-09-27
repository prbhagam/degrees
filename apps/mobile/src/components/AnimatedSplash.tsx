// Owner: shared mobile scaffold (Charles) — Added Sep 26 (wave 4). The animated splash: paper background, the
// Degrees mark settling into place while the node orbits, the wordmark fading in, then the whole thing lifts to
// reveal the app. Runs once per cold start, right after the native splash (which is plain paper, see app.json)
// hides, so the handoff is seamless. Total ~1.6s; never blocks — the app renders underneath from frame one.
import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { DegreesMark } from './DegreesMark';

const HOLD_MS = 1100;

export function AnimatedSplash({ onDone }: { onDone: () => void }) {
  const mark = useSharedValue(0);
  const word = useSharedValue(0);
  const lift = useSharedValue(0);

  useEffect(() => {
    mark.value = withTiming(1, { duration: 650, easing: Easing.out(Easing.back(1.4)) });
    word.value = withDelay(350, withTiming(1, { duration: 500, easing: Easing.out(Easing.quad) }));
    lift.value = withDelay(
      HOLD_MS,
      withSequence(
        withTiming(1, { duration: 420, easing: Easing.in(Easing.cubic) }, (finished) => {
          if (finished) runOnJS(onDone)();
        }),
      ),
    );
  }, [lift, mark, onDone, word]);

  const overlay = useAnimatedStyle(() => ({
    opacity: 1 - lift.value,
    transform: [{ translateY: -lift.value * 40 }],
  }));
  const markStyle = useAnimatedStyle(() => ({
    opacity: mark.value,
    transform: [{ scale: 0.6 + mark.value * 0.4 }],
  }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: word.value,
    transform: [{ translateY: (1 - word.value) * 8 }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.overlay, overlay]}>
      <Animated.View style={markStyle}>
        <DegreesMark size={132} animated orbitMs={1600} />
      </Animated.View>
      <Animated.View style={[styles.wordmark, wordStyle]}>
        <Text style={styles.word}>
          Degrees<Text style={styles.degree}>°</Text>
        </Text>
        <Text style={styles.tagline}>Real friends, a few degrees apart.</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: '#F7F3EC',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    elevation: 100,
  },
  wordmark: { alignItems: 'center', marginTop: 28, gap: 6 },
  word: { fontFamily: 'Fraunces_700Bold', fontSize: 34, color: '#20201C', letterSpacing: -0.5 },
  degree: { color: '#E8703A' },
  tagline: { fontFamily: 'PublicSans_500Medium', fontSize: 14, color: '#8A8378' },
});
