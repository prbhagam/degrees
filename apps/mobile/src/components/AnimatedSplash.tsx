// Owner: shared mobile scaffold (Charles). The animated splash: paper background, starting completely blank —
// no logo, nothing drawn (app.json's native splash is blank too, so there's no pop at handoff). The cursor
// previews each glyph before it's typed and only moves past it once it's actually struck — mimicking a real
// typing cursor, not a caret that teleports to a character that doesn't exist yet: it blinks at the d's start,
// the "d" strikes in at full size in a single instant (opacity 0->1, no animation, no scale, no bounce — a real
// keystroke doesn't ease in), the cursor advances to just after the d, blinks there, then jumps ahead to the
// ring's start and blinks there — previewing where the ring will land before it exists — then the ring strikes
// in the same way and the cursor advances to just after it. The mark itself is what's "typed" (there's only ever
// one logo on screen, never separate caption text). Once both are struck, that's exactly DegreesMark's resting
// pose, so the swap to <DegreesMark animated loop={false}> is pixel-for-pixel: it runs its shrink/grow/orbit
// cycle once, then the whole thing lifts to reveal the app underneath. Runs once per cold start; never blocks.
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
import { DegreesMark, D_POSE, RING_TOPRIGHT, INK, EMBER, ORBIT_MS } from './DegreesMark';

const dGlyph = require('../../assets/brand/d-glyph.png');
const ringGlyph = require('../../assets/brand/degree-ring.png');

// Must match app.json → expo-splash-screen imageWidth so the handoff is pixel-for-pixel. (Currently none — the
// native splash is left blank on purpose, see app.json.)
const MARK_SIZE = 132;
const PREVIEW_D_MS = 350; // cursor blinks alone at the d's start before it strikes
const AFTER_D_MS = 150; // cursor holds just after the newly-struck d
const PREVIEW_RING_MS = 250; // cursor previews the ring's start before it strikes
const TYPE_HOLD_MS = 450; // cursor holds just after the ring, before the mark takes over

type Phase = 'typing' | 'graphic';
// 0: previewing the d's start · 1: just after the d · 2: previewing the ring's start · 3: just after the ring
type CursorPos = 0 | 1 | 2 | 3;

export function AnimatedSplash({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>('typing');
  const px = (frac: number) => {
    'worklet';
    return frac * MARK_SIZE;
  };

  const dOpacity = useSharedValue(0);
  const ringOpacity = useSharedValue(0);
  const cursorPos = useSharedValue<CursorPos>(0);
  const cursorBlink = useSharedValue(1);
  const typingOpacity = useSharedValue(1);
  const lift = useSharedValue(0);

  useEffect(() => {
    cursorBlink.value = withRepeat(
      withSequence(withTiming(1, { duration: 0 }), withDelay(430, withTiming(0, { duration: 0 })), withDelay(430, withTiming(1, { duration: 0 }))),
      -1,
    );
    // Struck all at once, like a keystroke: opacity jumps 0->1 with no animation at all.
    dOpacity.value = withDelay(PREVIEW_D_MS, withTiming(1, { duration: 0 }));
    ringOpacity.value = withDelay(PREVIEW_D_MS + AFTER_D_MS + PREVIEW_RING_MS, withTiming(1, { duration: 0 }));
    // Advance one step at a time, each relative to the step before it — same chained-delay pattern as the blink.
    cursorPos.value = withSequence(
      withTiming(0, { duration: 0 }),
      withDelay(PREVIEW_D_MS, withTiming(1, { duration: 0 })),
      withDelay(AFTER_D_MS, withTiming(2, { duration: 0 })),
      withDelay(PREVIEW_RING_MS, withTiming(3, { duration: 0 })),
    );

    const t = setTimeout(() => {
      typingOpacity.value = withTiming(0, { duration: 150 });
      setPhase('graphic');
    }, PREVIEW_D_MS + AFTER_D_MS + PREVIEW_RING_MS + TYPE_HOLD_MS);
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
    const pos = cursorPos.value;
    // Positions 0-1 are the d's slot, 2-3 are the ring's; odd positions are "just after", even are "previewing".
    const box = pos < 2 ? D_POSE : RING_TOPRIGHT;
    const afterGlyph = pos === 1 || pos === 3;
    return {
      opacity: cursorBlink.value,
      left: px(afterGlyph ? box.left + box.width : box.left),
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
