---
updated: 2026-10-31T16:25:00Z
---

The **time grid**: time axis, day columns, lesson blocks (theory or lab colours, cancelled struck through), shared breaks in yellow, the 'now' line, and the legend. Used by the Rooster tab and `WeekView`.

## `BlockView`

Exported for the Rooster tab's `DayGrid`. 
One block (lesson, together or free). A free moment is a light grey fill without an outline, with a small coffee
cup in its top right corner (no text unless it has a label).

## `LessonBody`, `Fit`, `fitOf`, `LINE`

What a lesson card says, after the room it has: it measures itself and picks a layout in steps (`fitOf`: how many lines
of small text fit, and narrow / medium / wide), so it re-renders only when the layout would change, not on every frame
of a pinch. The pieces, in order: the course, its details as the source layout breaks them up (`lib/details.detailRows`:
Type, Building, Floor, Classroom … in your order), then the time; cancelled or exam first. **Tall and narrow** (a whole
week, a lane in Vergelijken): the name may wrap to two or three lines and each detail gets its own line, as many as
fit; on a very narrow card the type goes last (the colour already says it) and the name is shortened (`shortCourse`).
**Wide**: the name on one line ('Gewijzigd' next to it) and the details side by side under it, wrapping when there's
height. **One line**: the name, on a wide card with the first detail after it. Also used for friends' classes
(`FriendLane`, `friend`: no exam colours).

## `GridProps`, `TimeGrid`

The grid itself. `axis={false}` leaves the time axis out (the Rooster tab keeps one still axis while the
days slide past it). Columns glide to their new width when their number changes (layout animation).

## `TimeAxis`, `axisWidth`

The hours on the left of a grid, on its own; its width (narrower when compact). The first and last hour are always shown
(also when compact, where the hours in between are every other one) and a little brighter (`ink2` instead of `ink3`):
on the Rooster tab they are what you drag to change the hours (`Calendar`). `TimeAxis` is `memo`: give it the same
`hours` array while the hours are the same (`Calendar` does).

## `Legend`, `LegendItem`

Colour legend under a grid, one line that scrolls sideways (it never grows taller); the Rooster tab passes only what's on screen.
`Legend` is `memo`: give it the same `items` array while the items are the same.

## `START_HOUR`, `END_HOUR`

The visible hours (08–19).

## `MERGE_GAP`, `mergeLessons`

Back-to-back lessons of the **same course**, room, state and day show as **one block** (Untis sends a
double period as two lessons: 11:00–12:00 + 12:00–13:00 becomes 11:00–13:00). Up to `MERGE_GAP`
(15 min) apart still counts as back to back. Only for display: the API and the break logic keep the
separate lessons. Free/busy blocks of friends (no course) are never merged here; the API merges those.

## `Span`, `Block`, `Column`

Building blocks of a column.

## `Overlap`, `overlapsOf`, `OVERLAP_SLOP`, `lessonsAt`, `lessonsIn`

Lessons that run at the same time (two groups, a moved lesson, a class you follow twice): `overlapsOf` gives the
stretches where (merged, not cancelled) lessons overlap, three at once as one stretch. `lessonsAt(lessons, min)` is
what a tap means: within `OVERLAP_SLOP` (10) minutes of an overlap it's all its lessons (the screen asks which),
otherwise the one lesson under the finger. `lessonsIn` is the same for a day that has been worked out already (its merged
lessons and overlaps from `DayCache`), which is what the grid's tap uses.

## `OverlapBand`

The hatched band drawn over an overlap, on top of both blocks: diagonal lines (`--color-line-strong`), the course
names (or '2 lessen' in narrow columns; no label when the band is very short). Touches pass through to the grid's
tap; screen readers get a label that says to tap to choose.

## `dayBlocks`, `spanOf`, `overlaps`

A day's lessons (merged with `mergeLessons`) and shared breaks as blocks.

## `FREE_MIN`, `freeGaps`

The free moments between a day's lessons (the Rooster grid colours them grey): gaps of at least `FREE_MIN` (15)
minutes between merged lessons that take place, never before the first or after the last lesson. A cancelled
lesson leaves its time free.

## `KIND_DOT`, `kindsOf`

The week strip's dots: a day's kinds of lessons that take place, in the order they come, each as its strong colour
(`bg-theory`, `bg-lab`, …; an exam is ink).

## `isFree`, `SkippedBlock`

`isFree`: a lesson that doesn't keep you busy, cancelled or skipped (`lib/skips.ts`); free gaps, overlaps and the
strip's dots use it. A skipped class stays on your timetable as `SkippedBlock`: a dashed outline with its name struck
through, so the free time and a shared break (drawn over it) show through; a tap opens its sheet to take the skip
back. `lessonsAt` finds skipped ones only when asked (`skipped`), so a shared break over one wins the tap.

## `lessonKind`, `isOff`, `LessonKind`, `KIND_STYLE`, `KIND_LABEL`

The kind of a lesson as the API tells it (`api/roosters/kinds.py`: theory, lab, exercises, project, support,
internship, info, exam, other; lessons cached from before kinds: a guess from the name), its colours (a soft fill
and a stronger border, tokens in `global.css`) and its name; does a lesson not take place?

## `lessonLabel`

Exported: the Rooster tab's blocks use it for screen readers. 
Accessible label of a lesson.

## `shortCourse`

'Network Security' → 'NetSec' for narrow week columns.

## `TogetherBlock`, `TogetherSlot`

A shared break: the icon in the top corner with who it's with next to it, two names at most then "+2" (first names
in narrow columns), so it never needs more room than the block has. Its look follows its state (`TOGETHER_STYLE`):
**open** solid yellow, **asked** soft yellow with faint lines (the names on a patch, `HatchLabel`), **planned** solid
yellow with a check and a darker edge (`--color-together-edge`, so it differs from open in dark mode too),
**declined** soft red. On the solid yellow the text is always dark; on the soft looks it's `together-ink`, readable in
both themes. `muted` (over, or more than 13 days ahead: you can't ask for it): faded with a dashed edge, and no tap. Free moments (`BlockView` 'free')
have a coffee cup in the corner, 18 px (15 in narrow columns).

## `Hatch`, `HatchLabel`

Diagonal lines over a block (overlaps, breaks you asked for, the skip bin); wider than any column, the parent clips
them. It is **one SVG pattern filled into one rectangle** (`Pattern` with `patternTransform="rotate(45)"`, a unique id per
instance from `useId` because SVG ids are global on the web), not a line per stripe: the old version drew ~100–200
`Line`s per use. The lines are `gap` apart horizontally, as before, so the tile that repeats is `gap/√2` across; `gap`,
`width` and `opacity` mean what they did. Thin (1 px) and faint (`opacity`) on purpose: a texture, never louder than the text on it; a break's lines use
`--color-together-line`, dimmer in dark mode. Text over lines goes on `HatchLabel`: a rounded patch in the block's
own colour, so the lines stop around the text (the overlap band does the same with its course names).

## `BreakState`, `STATE_LABEL`, `TOGETHER_STYLE`

The states a shared break can show (`lib/breaks.slotState`), their words (legend, screen readers), and their looks.
The legend shows each state that's on screen.
