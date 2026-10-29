import { memo, type ReactNode, useEffect } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';

import { createStore } from '@/lib/store';

/** One sheet as the host draws it. `order`: higher is on top (the newest one opened). `visible`: open and taking
 * touches; otherwise it's sliding away, peeking, or armed out of sight (see `Sheet`'s `peek`), and nothing reaches it. */
export type SheetEntry = { id: number; order: number; visible: boolean; node: ReactNode; close: () => void };

const sheets = createStore<SheetEntry[]>([]);

/** A `Sheet` puts what it draws here, on every render of its own (a layout effect, so it's in the host before the
 * first paint). The entry keeps its place in the list until its order changes; nothing changes when nothing did. */
export function putSheet(e: SheetEntry) {
  sheets.set((list) => {
    const i = list.findIndex((x) => x.id === e.id);
    const old = list[i];
    if (old && old.node === e.node && old.order === e.order && old.visible === e.visible && old.close === e.close) return list;
    const next = i < 0 ? [...list, e] : list.map((x) => (x.id === e.id ? e : x));
    return old && old.order === e.order ? next : next.sort((a, b) => a.order - b.order);
  });
}

export function dropSheet(id: number) {
  sheets.set((list) => (list.some((x) => x.id === id) ? list.filter((x) => x.id !== id) : list));
}

let seq = 0;
/** A number higher than every sheet's so far: the sheet that opens now goes on top. */
export function nextSheetOrder() {
  return ++seq;
}

/**
 * Where every bottom sheet of the app is drawn, instead of each in its own native `Modal`: one view over the whole
 * app (the root layout puts the `Stack` inside it), above the tab bar, pushed screens and the status bar. A `Sheet`
 * renders its content here through `putSheet` (a portal), in the order they opened, so a sheet that opens while
 * another slides away (OverlapSheet → LessonSheet) lands on top.
 *
 * What the `Modal` used to do and now happens here: Android back closes the top open sheet; while one is open the app
 * behind it (and the sheets under it) is hidden from screen readers (`importantForAccessibility` on Android,
 * `accessibilityElementsHidden` on iOS, plus the sheet's own `accessibilityViewIsModal`). There is one gesture root,
 * the app's own. A screen presented as a native modal (none today) would need a host of its own inside it.
 */
export function SheetHost({ children }: { children: ReactNode }) {
  const list = sheets.use();
  let top: SheetEntry | undefined;
  for (const e of list) if (e.visible) top = e;
  const open = !!top;

  const close = top?.close;
  useEffect(() => {
    if (!close) return;
    // Registered after the navigator's own listener, so it's asked first
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [close]);

  return (
    <>
      <View style={styles.fill} importantForAccessibility={open ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={open}>
        {children}
      </View>
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {list.map((e) => (
          <HostedSheet key={e.id} node={e.node} visible={e.visible} hidden={e !== top} />
        ))}
      </View>
    </>
  );
}

/** One sheet's layer. `node` keeps its identity while that sheet didn't render, so the other sheets don't render when one does. */
const HostedSheet = memo(function HostedSheet({ node, visible, hidden }: { node: ReactNode; visible: boolean; hidden: boolean }) {
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={visible ? 'box-none' : 'none'}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      accessibilityElementsHidden={hidden}
    >
      {node}
    </View>
  );
});

const styles = StyleSheet.create({ fill: { flex: 1 } });
