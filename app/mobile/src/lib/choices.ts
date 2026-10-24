import type { ClassLesson, Semester, Source } from '@/api/types';

/**
 * Your course choices per class source while you're picking them (onboarding step 4, or a class in
 * settings), before they're saved. Two kinds:
 * - `include`: exactly these courses (picked one by one; empty = none). New sources start here, empty:
 *   nothing is chosen until you choose it.
 * - `exclude`: everything but these (sources from before, saved as 'all on, tap what you don't take').
 * Pure functions; the screen keeps a `Choices` object in state and saves it per source.
 */
export type Choice = { include: string[] } | { exclude: string[] };
export type Choices = Record<number, Choice>;

/** Where a source starts: what was saved, or nothing chosen for a class you just added. */
export function initialChoice(s: Source, fresh: boolean): Choice {
  const c = s.config;
  if (c.picked) return { include: c.include ?? [] };
  if ((c.include ?? []).length) return { include: c.include ?? [] };
  if (fresh && !(c.exclude ?? []).length) return { include: [] };
  return { exclude: c.exclude ?? [] };
}

export function isOn(c: Choice | undefined, course: string) {
  if (!c) return false;
  return 'include' in c ? c.include.includes(course) : !c.exclude.includes(course);
}

export function setOn(c: Choice, course: string, on: boolean): Choice {
  if ('include' in c) {
    const rest = c.include.filter((x) => x !== course);
    return { include: on ? [...rest, course] : rest };
  }
  const rest = c.exclude.filter((x) => x !== course);
  return { exclude: on ? rest : [...rest, course] };
}

/** 'Alles kiezen': every course listed now. 'Niets kiezen': none. */
export function setAll(courses: string[], on: boolean): Choice {
  return { include: on ? [...courses] : [] };
}

export function countOn(c: Choice | undefined, courses: string[]) {
  return courses.filter((x) => isOn(c, x)).length;
}

/** What to send to the API for a source. */
export function toConfig(c: Choice) {
  return 'include' in c ? { include: c.include, exclude: [], picked: true } : { exclude: c.exclude, include: [], picked: false };
}

/** A source covers this semester? (no semester = the whole year) */
export function inSemester(s: Source, sem: Semester | null) {
  return !s.semester || !sem || s.semester === sem;
}

/** Lessons of several classes as one timetable: only the courses you chose, each lesson once. */
export function preview(sources: Source[], lessons: Record<number, ClassLesson[]>, choices: Choices): (ClassLesson & { source: number })[] {
  const seen = new Set<string>();
  const out: (ClassLesson & { source: number })[] = [];
  for (const s of sources) {
    for (const l of lessons[s.id] ?? []) {
      if (!isOn(choices[s.id], l.course)) continue;
      const key = `${l.day}|${l.start}|${l.end}|${l.course}|${l.location ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...l, source: s.id });
    }
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.start - b.start));
}

export type DropOption = { key: string; label: { kind: 'class' | 'semester' | 'everywhere'; name?: string; semester?: Semester | null }; sources: number[] };

/**
 * 'Ik volg dit vak niet' on a lesson: what could go wrong, and the choices to offer.
 * - The course is on in several of your classes: off in one of them, or everywhere.
 * - The same class in both semesters: only this semester, or both.
 * - It's the last course left in a class: you'd follow nothing from it (the screen offers to remove it).
 * - The course has several groups in the timetable: switching it off switches every group off.
 * - It has exams: those go too.
 */
export function dropAnalysis(course: string, lesson: { source: number }, sources: Source[], lessons: Record<number, ClassLesson[]>, choices: Choices) {
  const holders = sources.filter((s) => isOn(choices[s.id], course) && (lessons[s.id] ?? []).some((l) => l.course === course));
  const here = sources.find((s) => s.id === lesson.source);
  const options: DropOption[] = [];
  const classes = new Set(holders.map((s) => s.class_id));
  if (classes.size > 1) {
    for (const s of holders) options.push({ key: `c${s.id}`, label: { kind: 'class', name: s.label, semester: s.semester }, sources: [s.id] });
    options.push({ key: 'all', label: { kind: 'everywhere' }, sources: holders.map((s) => s.id) });
  } else if (here) {
    // The same class followed in the other semester too, with this course on there
    const twin = sources.find((s) => s.id !== here.id && s.class_id === here.class_id && isOn(choices[s.id], course));
    if (twin) {
      options.push({ key: 'sem', label: { kind: 'semester', semester: here.semester }, sources: [here.id] });
      options.push({ key: 'both', label: { kind: 'everywhere' }, sources: [here.id, twin.id] });
    } else {
      options.push({ key: 'one', label: { kind: 'class', name: here.label, semester: here.semester }, sources: [here.id] });
    }
  }
  const all = Object.values(lessons).flat().filter((l) => l.course === course);
  const groups = [...new Set(all.map((l) => l.group).filter(Boolean) as string[])];
  const exams = all.some((l) => l.state === 'exam');
  // Classes you'd follow nothing from any more if you drop it everywhere you have it
  const emptied = holders.filter((s) => {
    const c = choices[s.id];
    if (!c || !('include' in c)) return false;
    return c.include.filter((x) => x !== course).length === 0;
  });
  return { options, groups, exams, emptied };
}

/** 'Ik mis een les': what your classes have on that day between two times that you haven't chosen. */
export function missing(day: string, from: number, to: number, sources: Source[], lessons: Record<number, ClassLesson[]>, choices: Choices) {
  const found: (ClassLesson & { source: number; on: boolean })[] = [];
  const seen = new Set<string>();
  for (const s of sources) {
    for (const l of lessons[s.id] ?? []) {
      if (l.day !== day || l.end <= from || l.start >= to || l.state === 'cancelled') continue;
      const key = `${s.id}|${l.course}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ ...l, source: s.id, on: isOn(choices[s.id], l.course) });
    }
  }
  return found.sort((a, b) => Number(a.on) - Number(b.on) || a.start - b.start);
}
