---
updated: 2026-10-24T03:30:00Z
---

The **time grid**: time axis, day columns, lesson blocks (theory or lab colours, cancelled struck through), shared breaks in yellow, the 'now' line, and the legend. Used by the Rooster tab and `WeekView`.

## `BlockView`

One block (lesson or together).

## `GridProps`, `TimeGrid`

The grid itself. `axis={false}` leaves the time axis out (the Rooster tab keeps one still axis while the
days slide past it). Columns glide to their new width when their number changes (layout animation).

## `TimeAxis`, `axisWidth`

The hours on the left of a grid, on its own; its width (narrower when compact).

## `Legend`, `LegendItem`

Colour legend under a grid; the Rooster tab passes only what's on screen.

## `START_HOUR`, `END_HOUR`

The visible hours (08–19).

## `MERGE_GAP`, `mergeLessons`

Back-to-back lessons of the **same course**, room, state and day show as **one block** (Untis sends a
double period as two lessons: 11:00–12:00 + 12:00–13:00 becomes 11:00–13:00). Up to `MERGE_GAP`
(15 min) apart still counts as back to back. Only for display: the API and the break logic keep the
separate lessons. Free/busy blocks of friends (no course) are never merged here; the API merges those.

## `Span`, `Block`, `Column`

Building blocks of a column.

## `dayBlocks`, `spanOf`, `overlaps`

A day's lessons (merged with `mergeLessons`) and shared breaks as blocks.

## `lessonKind`, `isOff`

Theory or lab (from the course name: Untis doesn't say); does a lesson not take place?

## `lessonLabel`

Accessible label of a lesson.

## `shortCourse`

'Network Security' → 'NetSec' for narrow week columns.
