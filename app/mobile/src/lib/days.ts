import { addDays, monday } from './time';

/**
 * The Rooster tab's days as numbers: day 0 is a Monday long ago, so day n is `n` days later and n % 7 is the
 * weekday (Monday = 0). What you see is a window [start, start + count) of days, scrolled continuously and
 * snapped to whole days (`snap`). Pure functions on local dates, no limit back or ahead.
 */
export const MAX_DAYS = 7;
const EPOCH = new Date(2001, 0, 1); // a Monday

export function dayIndex(d: Date): number {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((x.getTime() - EPOCH.getTime()) / 86_400_000);
}

export function dateAt(i: number): Date {
  return addDays(EPOCH, i);
}

/** Monday = 0 … Sunday = 6 */
export function weekdayOf(i: number) {
  'worklet';
  return ((i % 7) + 7) % 7;
}

export function mondayOf(i: number) {
  'worklet';
  return i - weekdayOf(i);
}

export function isWeekendIdx(i: number) {
  'worklet';
  return weekdayOf(i) >= 5;
}

/**
 * Where a swipe lands. `moved` is how far the finger took the view (in days, + = later), `velocity` the flick
 * (days per second). Day by day, with a little momentum (a fast swipe goes a few days, never more than a week).
 * Around an empty weekend it's calm: from a view that ends on Friday a short swipe shows the weekend (one or
 * two days), a bit further lands on next Monday; the same backwards from a view that starts on Monday.
 * `emptyWeekend(saturdayIndex)` says whether that weekend has nothing on it.
 */
export function snap(start: number, count: number, moved: number, velocity: number, emptyWeekend: (sat: number) => boolean) {
  'worklet';
  const momentum = Math.max(-3, Math.min(3, velocity * 0.16));
  const d = moved + momentum;
  if (Math.abs(d) < 0.35) return start;
  if (count < 7) {
    const last = start + count - 1;
    if (d > 0 && weekdayOf(last) === 4 && emptyWeekend(last + 1)) {
      // Short: the weekend comes into view; further: next Monday first
      return d < 2.5 ? start + Math.min(2, Math.max(1, Math.round(d))) : last + 3;
    }
    if (d < 0 && weekdayOf(start) === 0 && emptyWeekend(start - 2)) {
      // Short: the weekend before; further: the week before, ending on Friday
      return -d < 2.5 ? start - Math.min(2, Math.max(1, Math.round(-d))) : start - 3 - (count - 1);
    }
  }
  const step = Math.sign(d) * Math.min(7, Math.max(1, Math.round(Math.abs(d))));
  let target = start + step;
  if (count >= 5 && Math.abs(d) >= 2.5) {
    // A week view lands on a whole week after a big swipe: the nearest Monday
    const m = mondayOf(target);
    return target - m >= 4 ? m + 7 : m;
  }
  if (count < 7) {
    // A fast swipe in the middle of the week stops at Friday (or Monday going back) when the weekend is empty:
    // skipping it is for the next swipe, from the edge of the week
    const friday = mondayOf(start) + 4;
    if (step > 0 && !isWeekendIdx(start) && start + count - 1 < friday && target + count - 1 > friday && emptyWeekend(friday + 1)) {
      target = friday - count + 1;
    }
    const mon = mondayOf(start);
    if (step < 0 && !isWeekendIdx(start) && start > mon && target < mon && emptyWeekend(mon - 2)) target = mon;
  }
  return target;
}

/** The view the tab opens on: the week of today (Monday on, when 5 or 7 days fit), at an empty weekend the
 * coming week; with fewer days, today and the days after it (never past Friday). */
export function homeStart(count: number, today: number, emptyWeekend: (sat: number) => boolean) {
  let day = today;
  if (isWeekendIdx(day) && emptyWeekend(mondayOf(day) + 5)) day = mondayOf(day) + 7;
  if (count >= 5) return mondayOf(day);
  if (isWeekendIdx(day)) return day;
  const friday = mondayOf(day) + 4;
  return Math.max(mondayOf(day), Math.min(day, friday - count + 1));
}

export function weekStartOf(d: Date) {
  return dayIndex(monday(d));
}
