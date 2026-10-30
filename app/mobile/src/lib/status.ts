import type { Lesson, Status } from '@/api/types';
import type { Key, Params } from '@/i18n';

import { hhmm } from './time';

/** One line for the now-board: "Vrij tot 12:30", "Les tot 11:45", ... */
export function statusLine(s: Status, t: (k: Key, p?: Params) => string): { free: boolean; text: string; strong?: string } {
  const until = hhmm(s.until);
  switch (s.code) {
    case 'break':
      return { free: true, strong: t('status.free'), text: t('status.until', { t: until }) };
    case 'chilling':
      return { free: true, strong: t('status.free'), text: t('status.chilling') };
    case 'wants_to_chill':
      return { free: true, strong: t('status.free'), text: t('status.wantsToChill') };
    case 'break_busy':
      // Between classes, but said they're busy: not free for a break
      return { free: false, text: t('status.breakBusy') };
    case 'in_class':
      return { free: false, text: t('status.inClass', { t: until }) };
    case 'later':
      return { free: false, text: t('status.later', { t: until }) };
    case 'done':
      return { free: false, text: t('status.done') };
    case 'home':
      return { free: false, text: t('status.home') };
    case 'absent':
      return { free: false, text: t('status.absent') };
    case 'hidden':
      return { free: false, text: t('status.hidden') };
    default:
      return { free: false, text: t('status.noClasses') };
  }
}

/** Not on campus today: shown folded together at the bottom of the board. */
export function isAway(s: Status) {
  return ['home', 'absent', 'no_classes', 'hidden', 'done'].includes(s.code);
}

export function nextLesson(lessons: Lesson[], now: number) {
  return lessons.find((l) => l.busy && l.start >= now);
}

export function currentLesson(lessons: Lesson[], now: number) {
  return lessons.find((l) => l.busy && l.start <= now && now < l.end);
}

/** "Kayra", "Lotte en Amir", "Lotte, Amir en Ilias" */
export function joinNames(names: string[], and: string) {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`;
}
