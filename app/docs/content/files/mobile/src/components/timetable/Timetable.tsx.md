---
updated: 2026-10-24T10:30:00Z
---

The **time grid**: time axis, day columns, lesson blocks (theory or lab colours, cancelled struck through), shared breaks in yellow, the 'now' line, and the legend. Used by the Rooster tab and `WeekView`.

## `BlockView`

Exported for the Rooster tab's `DayGrid`. 
One block (lesson, together or free). A free moment is a light grey fill without an outline, with a small coffee
cup in its top right corner (no text unless it has a label).

## `GridProps`, `TimeGrid`

The grid itself. `axis={false}` leaves the time axis out (the Rooster tab keeps one still axis while the
days slide past it). Columns glide to their new width when their number changes (layout animation).

## `TimeAxis`, `axisWidth`

The hours on the left of a grid, on its own; its width (narrower when compact).

## `Legend`, `LegendItem`

Colour legend under a grid, one line that scrolls sideways (it never grows taller); the Rooster tab passes only what's on screen.

## `START_HOUR`, `END_HOUR`

The visible hours (08–19).

## `MERGE_GAP`, `mergeLessons`

Back-to-back lessons of the **same course**, room, state and day show as **one block** (Untis sends a
double period as two lessons: 11:00–12:00 + 12:00–13:00 becomes 11:00–13:00). Up to `MERGE_GAP`
(15 min) apart still counts as back to back. Only for display: the API and the break logic keep the
separate lessons. Free/busy blocks of friends (no course) are never merged here; the API merges those.

## `Span`, `Block`, `Column`

Building blocks of a column.

## `Overlap`, `overlapsOf`, `OVERLAP_SLOP`, `lessonsAt`

Lessons that run at the same time (two groups, a moved lesson, a class you follow twice): `overlapsOf` gives the
stretches where (merged, not cancelled) lessons overlap, three at once as one stretch. `lessonsAt(lessons, min)` is
what a tap means: within `OVERLAP_SLOP` (10) minutes of an overlap it's all its lessons (the screen asks which),
otherwise the one lesson under the finger.

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
in narrow columns), so it never needs more room than the block has. `muted` (over, or more than 13 days ahead: you
can't ask for it): hatched yellow with an outline instead of solid, and no tap. Free moments (`BlockView` 'free')
have a coffee cup in the corner, 18 px (15 in narrow columns).

## `Hatch`

Diagonal lines over a block (overlaps, muted shared breaks); wider than any column, the parent clips them.
