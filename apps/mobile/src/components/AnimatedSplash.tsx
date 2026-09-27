// Owner: shared mobile scaffold (Charles). The animated splash: paper background, starting completely blank —
// no logo, nothing drawn (app.json's native splash is blank too, so there's no pop at handoff). A cursor blinks,
// then the "d" strikes in at full size in a single instant (opacity 0->1 with no animation, no scale, no bounce
// — a real keystroke doesn't ease in), the cursor jumps to the ring's spot and blinks there, then the ring
// strikes in the same way — the mark itself is what's "typed" (there's only ever one logo on screen, never
// separate caption text). Once both are struck, that's exactly DegreesMark's resting pose, so the swap to
// <DegreesMark animated loop={false}> is pixel-for-pixel: it runs its shrink/grow/orbit cycle once, then the
// whole thing lifts to reveal the app underneath. Runs once per cold start; never blocks.
import { useCallback, useEffect, useState } from 'react';
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
const CURSOR_LEAD_MS = 350; // cursor blinks alone first, like it's about to type
const GAP_MS = 350; // cursor sits at the ring's spot before it strikes
const TYPE_HOLD_MS = 450; // lets the cursor blink a couple more times before the mark takes over

type Phase = 'typing' | 'graphic';

export function AnimatedSplash({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>('typing');
  const px = (frac: number) => {
    'worklet';
    return frac * MARK_SIZE;
  };

  const dOpacity = useSharedValue(0);
  const ringOpacity = useSharedValue(0);
  const cursorAtRing = useSharedValue(0); // 0: waiting at the d's spot, 1: waiting at the ring's spot
  const cursorBlink = useSharedValue(1);
  const typingOpacity = useSharedValue(1);
  const lift = useSharedValue(0);

  useEffect(() => {
    cursorBlink.value = withRepeat(
      withSequence(withTiming(1, { duration: 0 }), withDelay(430, withTiming(0, { duration: 0 })), withDelay(430, withTiming(1, { duration: 0 }))),
      -1,
    );
    // Struck all at once, like a keystroke: opacity jumps 0->1 with no animation at all.
    dOpacity.value = withDelay(CURSOR_LEAD_MS, withTiming(1, { duration: 0 }));
    cursorAtRing.value = withDelay(CURSOR_LEAD_MS, withTiming(1, { duration: 0 }));

    ringOpacity.value = withDelay(CURSOR_LEAD_MS + GAP_MS, withTiming(1, { duration: 0 }));

    const t = setTimeout(() => {
      typingOpacity.value = withTiming(0, { duration: 150 });
      setPhase('graphic');
    }, CURSOR_LEAD_MS + GAP_MS + TYPE_HOLD_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stable identity: DegreesMark's setup effect has `onDone` in its dependency array, so a fresh closure here on
  // every AnimatedSplash render would tear down and restart the whole shrink/grow/orbit animation mid-flight —
  // from whatever master.value it had reached, over the same total duration — corrupting and stretching out the
  // timing on any re-render that happens to land while the graphic phase is running.
  const handleGraphicDone = useCallback(() => {
    lift.value = withTiming(1, { duration: 450, easing: Easing.in(Easing.cubic) }, (finished) => {
      if (finished) runOnJS(onDone)();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDone]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: 1 - lift.value }));
  const markStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -lift.value * 60 }, { scale: 1 - lift.value * 0.15 }],
  }));
  const typingStyle = useAnimatedStyle(() => ({ opacity: typingOpacity.value }));
  const dStyle = useAnimatedStyle(() => ({ opacity: dOpacity.value }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: ringOpacity.value }));
  const cursorStyle = useAnimatedStyle(() => {
    const box = cursorAtRing.value > 0.5 ? RING_TOPRIGHT : D_POSE;
    // After the glyph, not before it: a typing cursor trails the character it just placed.
    return {
      opacity: cursorBlink.value,
      left: px(box.left + box.width),
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
            {/* The mark being struck in, one glyph at a time — the only logo on screen. */}
            <Animated.View style={[styles.glyph, { left: px(D_POSE.left), top: px(D_POSE.top), width: px(D_POSE.width), height: px(D_POSE.height) }, dStyle]}>
              <Image source={dGlyph} resizeMode="contain" style={{ width: '100%', height: '100%', tintColor: INK }} />
            </Animated.View>
            <Animated.View
              style={[styles.glyph, { left: px(RING_TOPRIGHT.left), top: px(RING_TOPRIGHT.top), width: px(RING_TOPRIGHT.width), height: px(RING_TOPRIGHT.height) }, ringStyle]}
            >
              <Image source={ringGlyph} resizeMode="contain" style={{ width: '100%', height: '100%', tintColor: EMBER }} />
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
  glyph: { position: 'absolute' },
  cursor: { position: 'absolute', width: 3, backgroundColor: '#20201C' },
});
