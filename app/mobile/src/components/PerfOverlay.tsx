import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedProps, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cacheStats, columnRenders, perfOverlay } from '@/lib/perf';
import { debugEnabled } from '@/lib/server';

const AnimatedInput = Animated.createAnimatedComponent(TextInput);

/** How often (ms) the numbers are recalculated. */
const WINDOW = 500;

/**
 * The fps overlay for measuring (guide 'Plan: a fast Rooster tab'), over every screen, never taking a touch. UI fps
 * counts the frames the UI thread draws (`useFrameCallback`) and writes them straight into a text on the UI thread,
 * so it keeps counting while JS is busy; JS fps counts `requestAnimationFrame`s. Under them: how often the Rooster
 * grid's day columns rendered since the last reset, and the size and `JSON.stringify` time of the persisted cache.
 * Only where `debugEnabled` is true and the switch on the Server & debug screen is on; off at every start.
 */
export function PerfOverlay() {
  const on = perfOverlay.use();
  if (!debugEnabled || !on) return null;
  return <Meter />;
}

function Meter() {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="none" style={[styles.box, { top: insets.top + 4 }]}>
      <UiFps />
      <JsStats />
    </View>
  );
}

function UiFps() {
  const label = useSharedValue('UI … fps');
  const frames = useSharedValue(0);
  const elapsed = useSharedValue(0);
  const worst = useSharedValue(0);
  useFrameCallback((frame) => {
    const dt = frame.timeSincePreviousFrame;
    if (!dt) return;
    frames.set(frames.get() + 1);
    elapsed.set(elapsed.get() + dt);
    worst.set(Math.max(worst.get(), dt));
    if (elapsed.get() >= WINDOW) {
      label.set(`UI  ${Math.round((frames.get() * 1000) / elapsed.get())} fps · worst ${Math.round(worst.get())} ms`);
      frames.set(0);
      elapsed.set(0);
      worst.set(0);
    }
  });
  // A TextInput takes its text from animated props (a Text can't), which is how a number gets on screen without React
  const props = useAnimatedProps(() => ({ text: label.get(), defaultValue: label.get() }) as never);
  return <AnimatedInput editable={false} pointerEvents="none" underlineColorAndroid="transparent" animatedProps={props} style={styles.text} />;
}

function JsStats() {
  const cache = cacheStats.use();
  const [js, setJs] = useState({ fps: 0, worst: 0 });
  const [cols, setCols] = useState(columnRenders());
  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let worst = 0;
    let last = performance.now();
    let prev = last;
    const tick = (now: number) => {
      frames++;
      worst = Math.max(worst, now - prev);
      prev = now;
      if (now - last >= WINDOW) {
        setJs({ fps: Math.round((frames * 1000) / (now - last)), worst: Math.round(worst) });
        setCols(columnRenders());
        frames = 0;
        worst = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <>
      <Text style={styles.text}>{`JS  ${js.fps} fps · worst ${js.worst} ms`}</Text>
      <Text style={styles.text}>{`columns: ${cols.renders} renders (${cols.days} days) in ${cols.seconds} s`}</Text>
      <Text style={styles.text}>{cache ? `cache: ${(cache.bytes / 1024).toFixed(0)} KB · ${cache.ms.toFixed(0)} ms · ${cache.writes} writes` : 'cache: not written yet'}</Text>
    </>
  );
}

const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });
const styles = StyleSheet.create({
  box: { position: 'absolute', right: 6, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.78)', zIndex: 1000, elevation: 1000 },
  text: { fontFamily: mono, fontSize: 11, lineHeight: 15, color: '#FFFFFF', padding: 0, margin: 0 },
});
