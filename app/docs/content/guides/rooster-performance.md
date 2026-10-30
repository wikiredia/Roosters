---
title: Plan: a fast Rooster tab (and fast sheets)
position: 65
updated: 2026-10-30T02:00:00Z
---

**Status: Phases 0, 1 and 2 are in the code (see their status notes below); the measurements, tuning the peek by feel
and Phase 3 are open.** Written after a code review of the Rooster tab (no device profiling
yet). The user reported: low fps while changing how many days you see, slow bottom sheets with a class's details,
and every action on the Rooster screen feeling heavy. Sheets are slow across the whole app. This guide says
**why**, **what to change**, in **what order**, and **what we can't avoid**. It is written for the agent who
implements it. Each phase is its own PR, and each PR updates the file docs it touches (see `docs/README.md` →
"For agents"). When a phase lands, mark it done here; when everything has landed, fold the lasting rules into the
file docs and the guide **The mobile app**, then delete this guide.

Line numbers are from commit `1cce711` and will drift. The diagnosis below describes the code **before** Phase 1.

## How the Rooster tab is built (the parts that matter for speed)

- `app/(tabs)/rooster.tsx`: `Screen` with the header, which shows 'Terug' and the date range from `onView`, and
  `Calendar` inside it.
- `components/timetable/Calendar.tsx`: one big component. It holds all state (start, want, zoomed, hints, the
  open sheet, skip toast…), builds `byDay` from `useWeeks`, and renders `DayStrip`, the `TimeAxis`, `DayGrid`,
  `DragLayer`, the `Legend` and three sheets (`OverlapSheet`, `BreakSheet`, `LessonSheet`).
- `components/timetable/DayGrid.tsx`: **22 `DayColumn`s** are always mounted (`from = start-7` … `to = start+14`).
  Each column is placed with `useAnimatedStyle(() => ({ left, width }))` from the shared `offset` and `count`.
  Every block is an `AView` with `entering` **and** `layout={LinearTransition}`.
- `components/timetable/DayStrip.tsx`: the week strip on top. It has the same 22 days and shares `offset`, `count`
  and `k`.
- `components/ui/Sheet.tsx`: every bottom sheet in the app is a React Native **`Modal`** with its own
  `GestureHandlerRootView` and a `KeyboardAvoidingView`. It mounts when it opens.

## Diagnosis: why it's slow

Ordered by how much each cause probably costs. The first three explain most of what the user feels.

### 1. Changing the number of days restarts hundreds of layout animations, every frame

When you drag the strip's handle or pinch, `count` changes every frame. Each of the 22 columns gets a new `width`,
a layout prop, through its animated style (`DayGrid.tsx` ~208). Every block in a column is an `AView` with
`layout={layout}` (`LinearTransition.duration(200)`, `DayGrid.tsx` ~238/259/277). So every frame, every block's
frame changes, and Reanimated **starts a new 200 ms layout transition for each block**. With ~15 school days in the
window and 4–6 blocks per day, that's 60–100+ layout animations restarted per frame, on top of Yoga re-laying out
and re-measuring every text. That is the "low fps when adjusting the visible day range".

The same transitions fire for every block in all 22 columns when `hours` changes, which happens when you swipe to
days with an earlier or later lesson, or zoom. That changes `pxPerHour`, so every `top`/`height` moves at once.

### 2. Columns are moved with `left`/`width` (layout props), not transforms

Even a plain swipe (`count` fixed) animates `left` on 22 views per frame (`DayGrid.tsx` ~208). On the New
Architecture, layout props go through a shadow-tree commit and a layout pass every frame. `transform`/`opacity`
can take Reanimated's fast path. Reanimated's own performance guide: avoid animating `top/left/width/height`,
prefer `translateX`, and keep simultaneously animated views under ~100 on low-end Android.

### 3. Bottom sheets: a native `Modal`, an artificial 200 ms wait, and a full screen re-render

Tap a class → sheet, step by step:
1. **≥200 ms wait before anything happens.** The grid's gesture is `Exclusive(drag, pan, doubleTap, tap)`. A
   single tap can only fire once the double tap has failed, which takes `maxDelay(200)` (`DayGrid.tsx` ~175–187). Every lesson tap
   waits at least 200 ms, by design.
2. `scheduleOnRN(tapAt)` → `setOpen` → **the whole `Calendar` re-renders**. `DayStrip` isn't memoized and gets a
   new `kinds` function and inline callbacks each render. `Legend`, `TimeAxis`, `DragLayer` (with a ~90-line
   `Hatch`) and all three sheets re-render too. `DayGrid` is memoized, so it's spared, but see 4.
3. `Sheet` mounts a **`Modal`**. On iOS that presents a new view controller; on Android, a dialog window. Inside it:
   a second `GestureHandlerRootView`, a `KeyboardAvoidingView`, then the content. All of it has to mount before the
   first frame of the slide. Presenting a `Modal` has a fixed cost on both platforms, and it's the same for every
   sheet in the app (`BreakSheet`, `MessageSheet`, `ChatInfoSheet`, `CoursePreview`, `AddLinkSheet`,
   `GhostSheet`). That's why sheets are slow everywhere.

### 4. The memo chain is broken, so "small" state changes re-render all 22 columns

`DayColumn` is `memo`, but it receives `{...p}`, every prop of the grid:
- `hours` is a new array whenever `start` or `want` changes (`Calendar.tsx` ~296–309, deps `[zoomed, stamp, start,
  want]`), even when the values are the same. So every swipe re-renders all 22 columns.
- `nowMin={nowMin()}` (`Calendar.tsx` ~415) changes every minute and goes to every column, though only today's
  uses it.
- `enterFrom` flips with the swipe direction and goes to every column.
- `byDay` (`Calendar.tsx` ~112–151) rebuilds **every day object** when `stamp` (the `dataUpdatedAt` of the weeks), `from`,
  `names` or `breaks.data` change. A background refetch with unchanged data (an ETag 304, or the `useBreaks`
  refetch) still changes `dataUpdatedAt`, so all columns re-render although nothing changed.
- Each `DayColumn` render calls `mergeLessons` several times (`dayBlocks`, `overlapsOf`, `freeGaps`), and
  `dragList` calls it again for all 22 days.
- `RoosterScreen` keeps `view` in state (`onView`). Each change re-renders `Screen` **and `Calendar` a second
  time**, because `Calendar` isn't memoized.
- While you drag the handle, `onResize` → `setWant` runs at every whole day you pass, with all of the above each time.

### 5. Columns that mount offscreen still animate in

After a swipe, `from`/`to` move. Up to 7 new columns mount at the edges, and every block in them runs an `entering`
animation (`FadeInRight/Left`), offscreen, at the moment the swipe spring starts. These views also get the
`layout` transitions from 1.

### 6. `Hatch` draws ~100–200 separate SVG lines per use

`Timetable.tsx` ~216: one `<Line>` every 7 px across `windowWidth + 400` px, so ~110 lines per hatch on a phone. It's
used on every overlap band, every "asked" shared break, the `Legend` swatch for "asked" (gap 4: ~200 lines for a
16×12 px swatch), and the skip bin in `DragLayer`, which is **always mounted** and re-renders with `Calendar`.

### 7. Smaller things that add up

- **Gesture objects are rebuilt every render** (`Gesture.Pan()` in `DayGrid`, `DayStrip`, `useSkipGesture`,
  `Sheet`). Reanimated's guide says to memoize them. Gesture Handler 3 (installed: `~3.3.0`) has hook versions
  (`usePanGesture`, …) that do this.
- **Hidden tabs keep rendering.** Bottom tabs keep visited screens mounted, so the Rooster tab's 22 columns
  re-render on query updates while you're on Today or Chat, and Today re-renders while you're on the Rooster tab.
- **The offline cache writes everything, often.** `lib/query.ts` persists the **whole** query cache to
  AsyncStorage (`JSON.stringify` on the JS thread) at most every 2 s after any cache change. `useChats` polls every
  15 s (`TabBar` keeps it alive everywhere), and the cache keeps every week you've ever scrolled to for 7 days
  (`gcTime`). That's a periodic hitch that grows with use. Measure the size before deciding how far to go.
- **`Text` runs `tailwind-merge` on every render** (`cn(...)` in `ui/Text.tsx`). It's cached, but with hundreds of
  texts per re-render it shows up. Low priority; fixing 4 removes most of those re-renders anyway.
- **Layout transitions on wrappers in `Calendar`** (the grid area `AView layout={layout}` ~399, the legend ~487).
  When something above them changes height (a hint appears, the − / + row goes away), the grid area animates its size,
  `onLayout` → `setSize` → `pxPerHour` changes → all columns re-render and their blocks animate (1).
- **No 120 Hz on iPhone** unless `CADisableMinimumFrameDurationOnPhone` is in Info.plist. Check whether RN 0.88's
  template already sets it; with CNG it goes in `app.json` → `ios.infoPlist`.
- **Reanimated 4 static feature flags** are off: `IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS`,
  `ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS` (fast path for transform/opacity), `USE_COMMIT_HOOK_ONLY_FOR_REACT_COMMITS`.
  They're set in `package.json`; check the exact format in the Reanimated docs ("Feature flags") for the installed
  4.7. Native change: needs a new development build.
- **React Compiler is off** (`app.json` has no `experiments.reactCompiler`). SDK 54+ configures Babel itself. The
  code already uses `.get()/.set()` on shared values, which the compiler needs. But `Calendar` writes
  `latest.current = …` during render, so the compiler will skip it until that's changed.

## Caveats and what we can't avoid

- **Measure in a release build.** A development build runs JS unoptimized with dev checks, often 2–5× slower.
  Judge fps and sheet speed only in a release or preview build (`eas build --profile preview`, or
  `npx expo run:ios --configuration Release` / `run:android --variant release`). Some of the lag the user saw may be
  debug mode; the causes above are real in release too.
- **A cloud agent can't see fps.** No simulator or phone here. The implementing agent can only reason, run
  `tsc`/lint, and add instrumentation. **The user has to test each phase on a phone**, ideally also a mid-range Android.
- **Changing the number of days will always lay out text every frame.** Column widths really change, so names
  re-wrap. After the fixes this costs "a few columns × a few blocks" per frame instead of "22 columns + 100
  restarted animations". It should hold 60 fps on recent phones; low-end Android at 7 days may still dip. The only
  way past that is drawing the grid on a canvas (react-native-skia), a rewrite we don't recommend now.
- **A single tap can't *know* it isn't a double tap for 200 ms.** That wait stays. Decided with the user: double tap
  keeps working everywhere, as it does now, and the first tap is answered at once with a **peek**. The sheet slides
  up a little straight away; a second tap sends it back down and zooms; no second tap and it opens fully (Phase
  2.2). The sheet is only fully open about as late as now, but the tap *feels* instant, and nothing blocks the second
  tap.
- **The peek needs sheets without `Modal`.** A `Modal` covers the whole screen and takes every touch, so the second
  tap would never reach the grid. The peek comes after the `SheetHost` (Phase 2.1).
- **Opening a sheet still renders its content once.** Without `Modal` that's a few ms for these small sheets. The
  slide starts in the same frame (the existing layout-effect trick).
- **Dropping `Modal` moves some things to us:** Android back closes the sheet (BackHandler), screen readers must
  not reach what's behind it (iOS `accessibilityViewIsModal`; Android: hide the app root from accessibility while
  a sheet is open), and the sheet must sit above the tab bar and pushed screens. The app has no `presentation:
  'modal'` screens today; if one is added later, a sheet opened from it needs a host inside that screen.
- **Lessons arriving from the network** still cause one render of the affected columns. Unavoidable, and cheap once 4
  is fixed.
- **`Calendar` is also Vergelijken** (`app/compare.tsx`), and `Sheet` is used on 8 screens. Every change here
  touches those. Test them too.

## The plan

Each phase is one PR (Phase 2 may be two: the sheet host and peek, then the grid). Do 1 first: it is small and measurable, and the peek (2.2) builds on its item 1.5.

### Phase 0: baseline and instrumentation (small, do first)

**Status: code done; the numbers (item 4) are for the user.** The overlay is in the root layout (`components/PerfOverlay.tsx`,
state and helpers in `lib/perf.tsx`), switched on at **Server & debug → Performance**. It is gated by `debugEnabled`, not
by `__DEV__`, so it also works in a release build that was made with `EXPO_PUBLIC_DEBUG=1` (a `preview` profile with that
variable; a production build never has it). The `<Profiler>` logs (`[perf] Calendar update 12.3 ms …`) and the first cache
write log are development-only, because React's profiler is off in release. The overlay also shows the size of the saved
cache and the time of its last `JSON.stringify` (it keeps measuring in a release build). The UI-fps line is an animated
`TextInput`; the technique is standard but this repo could not run it on a device, so if it shows nothing, the JS line and the
column counter still work.

1. A **dev-only perf overlay**, behind a toggle in `app/debug.tsx` or `app/dev.tsx`: a UI-thread fps meter
   (`useFrameCallback`, frame times → fps, as text in an animated text) and a JS-thread fps meter
   (`requestAnimationFrame`). Off by default and never in production UI.
2. A dev-only `<Profiler>` around `Calendar` and `DayGrid` that logs commit durations above 8 ms
   (`__DEV__ && console.log`), plus a render counter per `DayColumn` while the overlay is on.
3. Log, once in dev, the size of the persisted cache (the `JSON.stringify` length in the persister) and the time
   it takes.
4. The user records numbers in a **release** build for these scenarios: (a) swipe week to week, (b) drag the handle
   1→7→1, (c) pinch, (d) tap a class until the sheet starts moving, (e) open and close a `BreakSheet` on Today.
   Write them in the table at the end of this guide.

### Phase 1: quick wins in the grid (low risk)

**Status: code done, except item 6 (see below); not yet measured on a device.** What changed, per item:
1. Layout transitions removed from the blocks. Lessons fade in (from the side you went) only when a column's data arrives
   after its skeleton while that day is in view (`DayGrid.DayColumn`; the view comes from a small store `Calendar` keeps).
2. `Hatch` is one SVG `Pattern` in one `Rect`, a unique id per instance (`useId`). The tile is `gap/√2` across, not `gap`:
   the old stripes were `gap` apart *horizontally*, and a 45° tile `gap` wide would have spaced them `gap/√2` further apart. Direction,
   stroke width and opacity are as before. react-native-svg 15.16 has `Pattern` with `patternTransform` on iOS and Android in its
   source; it has **not been looked at on a device**: check an overlap band, an 'asked' break, the legend swatch and the skip bin.
3. The memo chain: `components/timetable/DayCache.ts` builds each week's days once (keyed by the week's data object, names,
   breaks, `only`, today, language; no `dataUpdatedAt`) with merged lessons, blocks, overlaps, free gaps, kinds, legend,
   bounds, skippable classes and tap stretches; `hours` is memoised on `"h0:h1"`; `DayColumn` gets its props explicitly, `nowMin`
   only on today, no `enterFrom`; `DayStrip`, `Legend`, `TimeAxis`, `DragLayer`, `SkipToast`, `TodayPill` and the three sheets are
   `memo` with stable props; `Calendar` is `memo`. `useSkipDrag` now returns one object (before, a new one every render defeated `DayGrid`'s memo).
4. The gestures of `DayGrid`, `DayStrip`, `useSkipGesture`, `Sheet` and `TodayPill` are `useMemo`'d (the builder API of Gesture Handler 3.3,
   not the new hooks), with stable callbacks (`lib/latest.ts`).
5. `TapTargets.ts`: the tappable stretches per day in a shared value; the tap gesture asks it first, so a tap on nothing never reaches JS.
   That is the only behaviour change. The JS `tapAt` still decides which sheet and was checked to agree with the stretches
   (a script compared them for 300 000 random day/minute points).
6. **Not done: `freezeOnBlur` does nothing in Expo Router 58.** Its `Tabs` type still has the option, but it is marked
   'Deprecated: This option has no effect in Expo Router' in the SDK 58 docs, and the bottom-tabs view hard-codes
   `freezeOnBlur: false` on the screens. Setting it would change nothing. The tab bar badge is not at risk (it lives in the bar). Options
   if hidden tabs still cost too much after the other items (the Rooster tab re-renders far less now): wrap a tab screen's content in
   `react-freeze`'s `<Freeze>` or React's `<Activity mode="hidden">` driven by `useIsFocused()`. `Activity` re-runs mount effects when
   shown again (`Calendar` would jump back to its home view), so `Freeze` is the one to try first; neither has been tried.
7. Lighter cache writes: `shouldPersist` (`lib/query.ts`) keeps me, today, friends, requests, breaks, chats, sources and the schedule
   weeks from one before this week to three after; the throttle is 5 s instead of 2 s. These were chosen **without the Phase 0
   numbers**: look at the overlay's cache line in a release build and tighten or relax. The cache shape didn't change, so `buster` stayed.

Not in the list, still open: the layout transitions on the wrappers in `Calendar` (the grid area and the legend), see 'Smaller things'.

1. **No more layout transitions on blocks.** Remove `layout={layout}` from the free, block and overlap `AView`s in
   `DayColumn`. Keep `entering` only where it means something: a column's blocks fade in when its data arrives
   after the skeleton (`loading` → loaded) while the column is in view. Columns that mount offscreen don't animate.
   Zoom (double tap) then jumps the hours; Phase 2.4 gives it a cheap animation back.
2. **`Hatch` as one pattern.** Use react-native-svg `<Defs><Pattern patternUnits="userSpaceOnUse" width={gap}
   height={gap} patternTransform="rotate(45)"><Line …/></Pattern></Defs><Rect fill="url(#id)" …/>` with a unique id
   per instance (`useId`). Check `Pattern` support in the installed react-native-svg 15.16 on both platforms. Keep
   the look the same: gap, width, opacity, 45°. Same component API, so `OverlapBand`, `TogetherBlock`, `Legend`
   and `DragLayer` don't change.
3. **Fix the memo chain**
   - `hours`: compute `[h0, h1]` and memo on `${h0}:${h1}`, so the array keeps its identity while the values don't
     change.
   - `DayColumn` gets `nowMin` only when `day === today` (others `null`), and no `enterFrom` prop: read the direction
     from a ref or a tiny context at mount.
   - Pass `DayColumn` its props explicitly instead of `{...p}`.
   - `byDay`: build **per week**, cached by that week's `data` object (TanStack's structural sharing keeps the same
     reference when nothing changed), `names`, `breaks.data` and `only`. Moving `start` then reuses all weeks
     still in the window, and a 304 refetch changes nothing. Drop `stamp` (dataUpdatedAt) from the deps.
   - Precompute per day, once, in that cache: merged lessons, blocks (without `past`, which depends on now), overlaps,
     free gaps, kinds, and the draggable targets. `DayColumn`, `dragList`, `kinds` and `legend` read them; nothing
     calls `mergeLessons` in a render anymore.
   - `DayStrip`: `memo`, with stable callbacks (`useCallback` or the `latest` ref pattern already in `Calendar`).
     Pass `kinds` as the `Map`, not a new function.
   - `Legend`, `TimeAxis`, `DragLayer`, `SkipToast`, `TodayPill`: `memo` with stable props.
   - The three sheets: render them from small memoized wrappers, so opening one renders only that sheet.
   - `RoosterScreen`: stop re-rendering `Calendar` when `view` changes. Wrap `Calendar` in `memo` (its props are
     already stable), or move the header bits (`TitleOrBack`, eyebrow) to read from a small store `Calendar` writes.
4. **Memoize gesture objects** (`useMemo` with the right deps, or the Gesture Handler 3 hooks; the upgrade guide
   lists renames like `onStart`→`onActivate`). Callbacks that gestures pass to `scheduleOnRN` must be stable (the
   `latest` ref pattern), or the memo is useless.
5. **Tappable rects on the UI thread** (groundwork for the peek, Phase 2.2). Keep a shared value of what a tap can
   open per day (lessons, overlaps, shared breaks you can ask for, skipped classes), filled from the per-day cache
   like `useDragTargets` does. Then the gesture can tell on the UI thread, without asking JS, whether a tap hit
   something that opens a sheet. No behaviour change yet.
6. **Hidden tabs don't render.** `freezeOnBlur: true` in the tabs' `screenOptions` (`app/(tabs)/_layout.tsx`);
   check that the option exists in expo-router 58's `Tabs`. Check the tab bar badge still updates: it lives in the
   tab bar, not in a screen.
7. **Lighter cache writes.** Based on the Phase 0 numbers: persist only what the next cold start needs
   (`dehydrateOptions.shouldDehydrateQuery`: me, friends, today, chats, and the schedule weeks within e.g. −1…+3
   weeks of today), and/or a longer `throttleTime`. If it's still big, consider TanStack's per-query persister.
   Bump `buster` if the shape changes.

Done when: (b) and (c) are clearly smoother in a release build, a swipe re-renders at most the columns that mount
(render counter), and opening a sheet re-renders only that sheet (the 200 ms wait goes in Phase 2.2).

### Phase 2: structural fixes (the bigger wins)

**Status: code done (all five items); not yet tried on a device. Needs a new development build (2.5 is native).** What
changed, per item:
- **2.1** `components/ui/SheetHost.tsx`, mounted around the `Stack` in `app/_layout.tsx`. `Sheet` keeps its props and
  renders into the host through a small store (`putSheet` from a layout effect, so the first frame of the slide is
  unchanged). Android back, screen-reader hiding (app content and the sheets under the top one), `accessibilityViewIsModal`
  and focus on the title, `KeyboardAvoidingView` (`padding` on both platforms, only while open), stacking by open order.
  No nested gesture root. No React context is lost (the app has none below the root).
- **2.2** `Sheet` has `peek` (`useSheetPeek`, `peekSheet`/`openPeek`/`dropPeek`, `PEEK_PX` = 104). `DayGrid`: the tap
  runs `Simultaneous` with the double tap; its worklet starts the peek; the double tap's `onEnd` drops it, its
  `onFinalize` (window ran out) opens it. A second touch inside the window is never a tap of its own (`second`/`pending`
  shared values: no `Date.now()` in the worklets). `Calendar`: `answer`, `peeking`, `answered`, `onPeekOpen`, `putAway`.
  Screen readers open fully at once; reduced motion: no peek, a short fade when the window runs out.
- **2.3** Columns: `translateX` + `width` in two animated styles. Mounted: the view ± `ceil(want)` days, extended from an
  animated reaction when a gesture goes further (`DayGrid` "Which columns exist"); `useWeeks` window unchanged. Day
  separators: one periodic drawing that moves by the fraction of a column (fades while the number of days changes),
  instead of one `Svg` per column; hour lines: one drawing. The tap, pinch and skip-drag math is unchanged.
- **2.4** `GridZoom` (`h0`, `pph`, `range`) in `Calendar`, animated 250 ms from a layout effect when the hours change.
  Blocks of the days in view (`Placed`), the hour lines (translate + scale) and `TimeAxis` (`zoom` prop) follow it.
  Known edge: when a swipe changes the hours, a column that just came into view may show the new hours for one frame.
- **2.5** `package.json` → `reanimated.staticFeatureFlags` (both `*_SYNCHRONOUSLY_UPDATE_UI_PROPS`, and
  `USE_COMMIT_HOOK_ONLY_FOR_REACT_COMMITS`, already the 4.7 default); `app.json` → `ios.infoPlist`
  `CADisableMinimumFrameDurationOnPhone`.

To test on a phone (both platforms, release build): every sheet in the app (Today's `BreakSheet`, `MessageSheet` and
`ChatInfoSheet` in a chat, `AddLinkSheet` with the keyboard, `GhostSheet` and log out on Ik, `CoursePreview` in onboarding);
Android back with a sheet open; VoiceOver/TalkBack can't reach the screen behind a sheet; tap / double tap / slow
second tap on a lesson near the bottom of the grid; overlap tap → pick a lesson; drag-to-skip, pinch anchor, the strip's
group drag and edge scroll (columns appear in time), a zoom (axis and blocks move together); 'Reset' (`TitleOrBack`),
`usePressScale` buttons and the `TodayPill` stay tappable with the synchronous flags.

1. **Sheets without `Modal`: a `SheetHost`.** One host view mounted in the root layout (`app/_layout.tsx`, after the
   `Stack`, absolute fill, above everything), and a portal: `Sheet` renders its content into the host instead of
   into a `Modal`. Keep `Sheet`'s props and behaviour exactly as they are (`visible`, `onClose`, `title`, `sub`,
   `left`, `above`, the shared `progress`/`height` that `MessageSheet` and the chat use, drag-to-close, the slide in
   the first frame, staying mounted until the slide ends), so the 8 users don't change. Then:
   - no nested `GestureHandlerRootView` (the root one covers it);
   - Android back: `BackHandler` closes the top sheet;
   - accessibility: `accessibilityViewIsModal` on the sheet (iOS); on Android, while a sheet is open,
     `importantForAccessibility="no-hide-descendants"` on the app content next to the host; focus moves to the sheet
     title;
   - keyboard: `KeyboardAvoidingView` inside the host (`AddLinkSheet` and `MessageSheet` have inputs). Test both
     platforms;
   - status bar and safe area: the host covers the status bar like `statusBarTranslucent` did;
   - more than one sheet at once (the `OverlapSheet` → `LessonSheet` hand-off) stacks in order.

   An alternative is native form sheets through the router (`presentation: 'formSheet'`). It's fully native and
   smooth, but sheets would become routes, and the shared `progress`/`above` tricks in chat don't map. Not
   recommended for now.
2. **Peek on the first tap** (needs 2.1; decided with the user). Double tap stays exactly as it is: zoom, anywhere on
   the grid. A single tap on something that opens a sheet is answered **at once**:
   - **The gesture.** The single-tap gesture no longer waits for the double tap to fail. It runs alongside it
     (`Simultaneous`, still after `drag` and `pan` in the `Exclusive`, keeping the 8 px `maxDistance`). Its `onEnd`
     **worklet** hit-tests against the rects from 1.5. On a hit it starts the peek **on the UI thread in the same
     frame**: a shared `peek` value, no JS round trip. Then `scheduleOnRN` tells `Calendar` what was tapped, which
     renders the sheet's content into the already-peeking sheet. An empty-space tap does nothing, as now.
   - **The peek.** The sheet slides up from the bottom to a small height: the grabber, the title row and a bit of the
     first card, about 90–120 px, quick ease-out (~120 ms). No scrim yet, or a very faint one. The sheet itself is
     `pointerEvents="none"` while peeking, so a second tap anywhere, even on a lesson near the bottom that the peek
     covers, reaches the grid.
   - **Second tap** (the double tap activates within its `maxDelay`): the peek slides back down fast (~120 ms,
     ease-in), `onDoubleTap` zooms, and the sheet is never opened. Clear the pending sheet in `Calendar`.
   - **No second tap**: when the double-tap window closes (its `maxDelay`, or the gesture failing, whichever comes
     first), the sheet continues from the peek to fully open **in one motion**, no stop or bounce at the peek
     height. The scrim fades in and the sheet takes touches. Drive both stages with the one `progress` value
     `Sheet` already has: peek = a fixed px height, open = 1.
   - **Content can be a frame late.** If the content renders a frame after the peek starts, the peek shows the empty
     chrome (grabber, an empty title line) for that frame. Fine at that size. Don't wait for it.
   - **Everything that opens from a grid tap uses it:** `LessonSheet`, `OverlapSheet`, `BreakSheet` (a shared break),
     a skipped class's sheet. Screen readers (`onAccessibilityTap`) open fully at once, no peek, because there is no
     double tap there. With reduced motion (`useReducedMotion`): no slide, wait for the window, then a short fade-in.
   - **`Sheet` API:** a way to open in the peek stage (e.g. `stage: 'peek' | 'open'`, or a `peek` shared value the
     caller drives) next to `visible`. Other sheets in the app don't change and open as they do.
   - **Tune by feel with the user:** peek height, peek speed, and the double-tap `maxDelay`. 200 ms now; a bit lower
     makes the full open come sooner, too low makes double taps harder.

   Done when: the peek starts in the frame the finger lifts, a double tap on a lesson zooms with the peek going back
   down (and no sheet), and a single tap opens the sheet fully with no visible pause at the peek.
3. **Columns on transforms, and fewer of them**
   - Position columns with `transform: [{ translateX: (day - offset) * colW }]` and `left: 0`. `width` stays an
     animated style, but only changes when `count` changes. A swipe is then transform-only, on the fast path.
     Better still: one track `AView` with a single translateX, if the coordinate math of the gestures stays simple.
   - Mount fewer columns: the visible days plus a buffer of `ceil(count)` on each side, instead of a fixed 22.
     Keep **fetching** the same weeks (`useWeeks` window unchanged), so data is there before you land. When a
     gesture moves the view more than the buffer (the strip's edge-scroll in `DayStrip`, a 7-day pinch), extend the
     window via `scheduleOnRN` when a whole day is crossed (it already does `onMove`); mounting one column is cheap
     after Phase 1.
   - Draw the vertical day separators in one SVG with the hour lines instead of one `Svg` per column.
   - `SkipDrag` (`useSkipGesture`, `DragLayer`) and `tapAt` compute positions from `offset`/`count`/`width`. Keep
     that math identical and test drag-to-skip, tap, overlap tap, pinch anchor and the strip's group drag.
4. **Zoom with a cheap animation.** Animate the hour range as shared values (`h0`, `pxPerHour`) and place the
   blocks of the **visible** columns with `top`/`height` from them for the ~250 ms of a zoom (at most 7 columns × a
   few blocks), or crossfade the grid. The `TimeAxis` uses the same values, so it moves with the blocks. It no
   longer jumps after them as it does now.
5. **Reanimated feature flags and 120 Hz.** Turn on `IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS`,
   `ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS`, `USE_COMMIT_HOOK_ONLY_FOR_REACT_COMMITS` (check the names and format for
   4.7). Add `CADisableMinimumFrameDurationOnPhone` if needed. The docs warn that the synchronous flags affect touch
   detection on views with animated transforms: `TitleOrBack`, buttons with `usePressScale` and `TodayPill` must
   still be tappable everywhere they're drawn. Native change: tell the user a new development build is needed.

Done when: (a)–(c) hold ~60 fps (120 on ProMotion) on a recent phone in release, (d) peeks in the frame the
finger lifts, and (e) starts sliding within one or two frames.

### Phase 3: optional polish

1. **React Compiler** (`experiments.reactCompiler: true` in `app.json`). First remove render-time ref writes
   (`latest.current = …` → a `useLayoutEffect` or an effect-event pattern), then turn it on and run the app through
   every screen. Use `'use no memo'` on anything that misbehaves. Do this after Phases 1 and 2, so a regression
   points at one change.
2. `Text`: skip `twMerge` when there's no `className` (join the fixed classes directly).
3. Look at the Today tab and Chat with the Phase 0 overlay; this plan didn't review them in depth.

## Docs to update with each phase

`files/mobile/src/components/timetable/DayGrid.tsx.md` (placement, mounted window, taps),
`Calendar.tsx.md` (byDay cache, memo rules), `DayStrip.tsx.md`, `Timetable.tsx.md` (`Hatch`),
`SkipDrag.tsx.md`, `ui/Sheet.tsx.md` (host, back, accessibility), `ui/Motion.tsx.md` (when *not* to use `layout`),
`app/_layout.tsx` and `(tabs)/_layout.tsx` docs, `lib/query.ts` doc, and the guide **The mobile app** ("The Rooster
tab"). Add a short "performance rules" section there: no `layout` transitions inside the grid, move things with
transforms, stable props into memoized columns, no `Modal` for sheets.

## Which model

- **Phase 0 and Phase 1: Sonnet is enough.** They're local, well-specified edits with clear done criteria, and
  `tsc`/lint catch most mistakes. Item 1.5 (tappable rects) is the one place to be careful; give it
  `useDragTargets` as the model to follow.
- **Phase 2: use Opus.** The peek (2.2) coordinates a gesture worklet, a shared value, a React render and a
  two-stage sheet animation, and must stay out of the way of the double tap. It changes the coordinate system three gestures, the strip and the drag layer share,
  replaces `Modal` across 8 call sites with platform-specific back, keyboard and accessibility behaviour, and none of
  it can be checked from a cloud sandbox. The mistakes are subtle: a tap landing on the wrong day, a sheet a screen
  reader can see through, a pinch anchor that drifts. Opus is more likely to get them right without a device in
  the loop.
- If one agent does everything in one go: Opus.

## Measurements

Release build. Fill in before and after each phase.

| Scenario | Device | Before | After P1 | After P2 |
| --- | --- | --- | --- | --- |
| (a) swipe week to week, UI / JS fps | | | | |
| (b) handle 1→7→1, UI / JS fps | | | | |
| (c) pinch, UI / JS fps | | | | |
| (d) tap class → peek moving / fully open (ms) | | | | |
| (e) Today: open `BreakSheet` (ms) | | | | |
