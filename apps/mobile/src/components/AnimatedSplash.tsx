// Owner: shared mobile scaffold (Charles). The animated splash: paper background, starting from the exact
// pixels the native splash left on screen (assets/images/splash-icon.png at 132pt, see app.json) — no pop.
// A cursor types "d" then "°" beneath the mark, then the mark itself runs its shrink/grow/orbit cycle once
// (DegreesMark's `loop={false}`), then the whole thing lifts to reveal the app. Runs once per cold start;
// never blocks — the app renders underneath from frame one.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { DegreesMark } from './DegreesMark';

// Must match app.json → expo-splash-screen imageWidth so the handoff is pixel-for-pixel.
const MARK_SIZE = 132;
const ORBIT_MS = 1000;
const TYPE_D_MS = 250;
const TYPE_RING_MS = 300;
const TYPE_HOLD_MS = 500; // lets the cursor blink a couple of times before the mark takes over

type Phase = 'typing' | 'graphic' | 'done';

export function AnimatedSplash({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>('typing');
  const [typedCount, setTypedCount] = useState(0);
  const cursor = useSharedValue(1);
  const typedOpacity = useSharedValue(1);
  const lift = useSharedValue(0);

  useEffect(() => {
    cursor.value = withRepeat(
      withSequence(withTiming(0, { duration: 0 }), withDelay(430, withTiming(1, { duration: 0 })), withDelay(430, withTiming(0, { duration: 0 }))),
      -1,
    );
    const t1 = setTimeout(() => setTypedCount(1), TYPE_D_MS);
    const t2 = setTimeout(() => setTypedCount(2), TYPE_D_MS + TYPE_RING_MS);
    const t3 = setTimeout(() => {
      typedOpacity.value = withTiming(0, { duration: 200 });
      setPhase('graphic');
    }, TYPE_D_MS + TYPE_RING_MS + TYPE_HOLD_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGraphicDone = () => {
    lift.value = withTiming(1, { duration: 450, easing: Easing.in(Easing.cubic) }, (finished) => {
      if (finished) runOnJS(onDone)();
    });
  };

  const overlayStyle = useAnimatedStyle(() => ({ opacity: 1 - lift.value }));
  const markStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -lift.value * 60 }, { scale: 1 - lift.value * 0.15 }],
  }));
  const typedStyle = useAnimatedStyle(() => ({ opacity: typedOpacity.value }));
  const cursorStyle = useAnimatedStyle(() => ({ opacity: cursor.value }));

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.overlay, overlayStyle]}>
      <Animated.View style={markStyle}>
        <DegreesMark size={MARK_SIZE} animated={phase === 'graphic'} loop={false} orbitMs={ORBIT_MS} onDone={handleGraphicDone} />
      </Animated.View>
      <Animated.View style={[styles.typed, typedStyle]}>
        <View style={styles.typedRow}>
          <Text style={styles.word}>{typedCount >= 1 ? 'd' : ''}</Text>
          <Text style={[styles.word, styles.degree]}>{typedCount >= 2 ? '°' : ''}</Text>
          <Animated.View style={[styles.cursor, cursorStyle]} />
        </View>
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
  // Sits below the mark without moving it: absolute, so the mark stays exactly where the native image was.
  typed: { position: 'absolute', top: '50%', marginTop: MARK_SIZE / 2 + 22, alignItems: 'center' },
  typedRow: { flexDirection: 'row', alignItems: 'flex-end' },
  word: { fontFamily: 'Fraunces_700Bold', fontSize: 34, color: '#20201C', letterSpacing: -0.5 },
  degree: { color: '#E8703A' },
  cursor: { width: 3, height: 30, marginLeft: 3, marginBottom: 3, backgroundColor: '#20201C' },
});
