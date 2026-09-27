// Owner: shared mobile scaffold (Charles) — Added Sep 26 (wave 4). The animated splash: paper background, the
// Degrees mark settling into place while the node orbits, the wordmark fading in, then the whole thing lifts to
// reveal the app. Runs once per cold start, right after the native splash hides, so the handoff is seamless.
// Never blocks — the app renders underneath from frame one.
// CHANGED Sep 26 (wave 5, Sahith): the native splash now shows the SAME mark (assets/images/splash-icon.png at
// 132pt, see app.json), so this starts with the mark already drawn exactly where the OS left it — no pop. From
// there the logo comes alive: the node makes a lap, the rings ripple after it, the wordmark rises, then it lifts.
import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { DegreesMark } from './DegreesMark';

// Must match app.json → expo-splash-screen imageWidth so the handoff is pixel-for-pixel.
const MARK_SIZE = 132;
const ORBIT_MS = 1300;
const HOLD_MS = 1500;

export function AnimatedSplash({ onDone }: { onDone: () => void }) {
  const word = useSharedValue(0);
  const lift = useSharedValue(0);

  useEffect(() => {
    word.value = withDelay(300, withTiming(1, { duration: 550, easing: Easing.out(Easing.quad) }));
    lift.value = withDelay(
      HOLD_MS,
      withTiming(1, { duration: 450, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(onDone)();
      }),
    );
  }, [lift, onDone, word]);

  const overlay = useAnimatedStyle(() => ({
    opacity: 1 - lift.value,
  }));
  const markStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -lift.value * 60 }, { scale: 1 - lift.value * 0.15 }],
  }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: word.value * (1 - lift.value),
    transform: [{ translateY: (1 - word.value) * 10 - lift.value * 60 }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.overlay, overlay]}>
      <Animated.View style={markStyle}>
        <DegreesMark size={MARK_SIZE} animated orbitMs={ORBIT_MS} />
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
  // The wordmark sits below the mark without moving it: absolute, so the mark stays where the native image was.
  wordmark: { position: 'absolute', top: '50%', marginTop: MARK_SIZE / 2 + 22, alignItems: 'center', gap: 6 },
  word: { fontFamily: 'Fraunces_700Bold', fontSize: 34, color: '#20201C', letterSpacing: -0.5 },
  degree: { color: '#E8703A' },
  tagline: { fontFamily: 'PublicSans_500Medium', fontSize: 14, color: '#8A8378' },
});
