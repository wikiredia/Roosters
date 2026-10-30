---
updated: 2026-10-30T02:00:00Z
---

**Where every bottom sheet is drawn**: one layer over the whole app, mounted once in the root layout (`app/_layout.tsx`)
with the `Stack` inside it. `Sheet` (components/ui/Sheet.tsx) puts its content here instead of into a native `Modal`
(a portal through a small store). Because the layer comes after the `Stack` in the root view, it's above the tab bar,
pushed screens and the status bar (the root view is edge to edge, as `statusBarTranslucent` was). The app has no
`presentation: 'modal'` screens; a sheet opened from one would need a host inside that screen.

What the `Modal` did and now happens here:
- **Android back** closes the top open sheet (a `BackHandler` listener, added after the navigator's, so it's asked first).
- **Screen readers**: while a sheet is open the app behind it is hidden (`importantForAccessibility="no-hide-descendants"`
  on Android, `accessibilityElementsHidden` on iOS), and so are the sheets under the top one and the ones out of sight
  (closing, peeking, armed). The sheet itself is `accessibilityViewIsModal` and moves the focus to its title.
- **Touches**: only an open sheet takes them (its scrim covers everything); one that slides away or peeks lets them
  through.
- **One gesture root**: the app's own (`GestureHandlerRootView` in the root layout); a sheet doesn't add one.

No React context is lost by drawing the content here: the app's state lives in stores and the query client, both above
the host. If you add a context that a sheet's content reads, provide it above `SheetHost`.

## `SheetHost`

The app's content (in a view that's hidden from screen readers while a sheet is open) and the layer of sheets, in their
`order`. Each sheet's layer is `memo` on its node, so one sheet rendering doesn't render the others.

## `SheetEntry`, `putSheet`, `dropSheet`, `nextSheetOrder`

One sheet as the host draws it (`visible`: open and taking touches; `close`: what Android back calls); a sheet puts it
here on every render of its own (nothing changes when nothing did) and drops it when it unmounts; the next order number,
so the sheet that opens now goes on top.
