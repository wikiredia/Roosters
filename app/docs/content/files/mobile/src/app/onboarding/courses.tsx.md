---
updated: 2026-10-24T05:00:00Z
---

Step 4: **per semester, every course of your classes this school year** (not only the coming weeks: the choice
lasts all year). **Nothing is chosen until you choose it**: tap a course, 'Alles kiezen' / 'Niets kiezen' per
class, or tap lessons in the class's own timetable ('Bekijk het rooster van …', `ClassWeekSheet`). **Bekijk
gevonden rooster** (`PreviewSheet`) shows the timetable your choices give before you save, with 'Ik volg dit vak
niet' and 'Ik mis een les'. Klaar saves per source (`lib/choices.ts` → `include` + `picked`); a class with
nothing chosen asks to be removed. **Skip** keeps every course (a skipped step never leaves you with an empty
timetable). From settings (`source=<id>`) for one class, starting from what's saved, with 'remove this class'.

## `CoursesStep`

Groups your class sources per semester (a whole-year source shows in both, with one set of choices), keeps the
choices in state (`Choices`), and saves them.

## `ClassCourses`

The courses of one class in one semester (`GET …/courses?semester=`, which may say `syncing` or `scanning` and
poll) as chips, with the count, 'Alles kiezen' / 'Niets kiezen' and the link to the class's timetable.

## `SemesterHead`, `SEMESTERS`

'SEMESTER 1 · sep – jan · Nu'.
