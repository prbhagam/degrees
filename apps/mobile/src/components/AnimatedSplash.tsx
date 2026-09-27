// Owner: shared mobile scaffold (Charles). The animated splash: paper background, starting completely blank —
// no logo, nothing drawn (app.json's native splash is blank too, so there's no pop at handoff). A cursor types
// the "d", then the degree ring, directly into place (a left-to-right reveal, not separate caption text — the
// mark itself is what's "typed", so there's only ever one logo on screen). Once both are drawn, that becomes
// exactly DegreesMark's resting pose, so the swap to <DegreesMark animated loop={false}> is pixel-for-pixel: it
// runs its shrink/grow/orbit cycle once, then the whole thing lifts to reveal the app underneath. Runs once per
// cold start; never blocks — the app renders from frame one.
import { useEffect, useState } from 'react';
import { Image, StyleSheet } from 'react-native';
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
import { DegreesMark, D_POSE, RING_TOPRIGHT, INK, EMBER } from './DegreesMark';

const dGlyph = require('../../assets/brand/d-glyph.png');
const ringGlyph = require('../../assets/brand/degree-ring.png');

// Must match app.json → expo-splash-screen imageWidth so the handoff is pixel-for-pixel. (Currently none — the
// native splash is left blank on purpose, see app.json.)
const MARK_SIZE = 132;
const ORBIT_MS = 1000;
const REVEAL_D_MS = 450;
const REVEAL_GAP_MS = 150;
const REVEAL_RING_MS = 300;
const TYPE_HOLD_MS = 400; // lets the cursor blink a couple of times before the mark takes over

type Phase = 'typing' | 'graphic';

export function AnimatedSplash({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>('typing');
  const px = (frac: number) => frac * MARK_SIZE;

  const dReveal = useSharedValue(0); // 0..1
  const ringReveal = useSharedValue(0); // 0..1
  const cursor = useSharedValue(0);
  const typingOpacity = useSharedValue(1);
  const lift = useSharedValue(0);

  useEffect(() => {
    cursor.value = withRepeat(
      withSequence(withTiming(1, { duration: 0 }), withDelay(430, withTiming(0, { duration: 0 })), withDelay(430, withTiming(1, { duration: 0 }))),
      -1,
    );
    dReveal.value = withTiming(1, { duration: REVEAL_D_MS, easing: Easing.out(Easing.cubic) });
    ringReveal.value = withDelay(REVEAL_D_MS + REVEAL_GAP_MS, withTiming(1, { duration: REVEAL_RING_MS, easing: Easing.out(Easing.cubic) }));
    const t = setTimeout(() => {
      typingOpacity.value = withTiming(0, { duration: 150 });
      setPhase('graphic');
    }, REVEAL_D_MS + REVEAL_GAP_MS + REVEAL_RING_MS + TYPE_HOLD_MS);
    return () => clearTimeout(t);
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
  const typingStyle = useAnimatedStyle(() => ({ opacity: typingOpacity.value }));
  const dRevealStyle = useAnimatedStyle(() => ({ width: px(D_POSE.width) * dReveal.value }));
  const ringRevealStyle = useAnimatedStyle(() => ({ width: px(RING_TOPRIGHT.width) * ringReveal.value }));
  const cursorStyle = useAnimatedStyle(() => {
    const typingRing = ringReveal.value > 0;
    const box = typingRing ? RING_TOPRIGHT : D_POSE;
    const revealW = typingRing ? ringReveal.value * px(box.width) : dReveal.value * px(box.width);
    return {
      opacity: cursor.value,
      left: px(box.left) + revealW,
      top: px(box.top),
      height: px(box.height),
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.overlay, overlayStyle]}>
      <Animated.View style={[{ width: MARK_SIZE, height: MARK_SIZE }, markStyle]}>
        {phase === 'graphic' ? (
          <DegreesMark size={MARK_SIZE} animated loop={false} orbitMs={ORBIT_MS} onDone={handleGraphicDone} />
        ) : (
          <Animated.View style={typingStyle}>
            {/* The mark being typed in, left to right — the only logo on screen. */}
            <Animated.View style={[styles.revealBox, { left: px(D_POSE.left), top: px(D_POSE.top), height: px(D_POSE.height) }, dRevealStyle]}>
              <Image source={dGlyph} resizeMode="contain" style={{ width: px(D_POSE.width), height: px(D_POSE.height), tintColor: INK }} />
            </Animated.View>
            <Animated.View style={[styles.revealBox, { left: px(RING_TOPRIGHT.left), top: px(RING_TOPRIGHT.top), height: px(RING_TOPRIGHT.height) }, ringRevealStyle]}>
              <Image source={ringGlyph} resizeMode="contain" style={{ width: px(RING_TOPRIGHT.width), height: px(RING_TOPRIGHT.height), tintColor: EMBER }} />
            </Animated.View>
            <Animated.View style={[styles.cursor, cursorStyle]} />
          </Animated.View>
        )}
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
  // overflow:hidden + an animated width is the reveal: the image inside is full size and fixed, only the
  // window onto it grows.
  revealBox: { position: 'absolute', overflow: 'hidden' },
  cursor: { position: 'absolute', width: 3, backgroundColor: '#20201C' },
});
