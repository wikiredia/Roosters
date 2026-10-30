import { prefs } from './storage';
import { createStore } from './store';

/**
 * Experiments you turn on under Ik → Experimenten, saved on this phone. Each one starts off; screens read it with
 * its hook and update the moment you flip it.
 */

const WEEK_DRAG_KEY = 'rooster.weekDrag';

/** Vertical calendar dragging: drag the week strip up or down to see and go to the week before or after. */
export const weekDrag = createStore(false);

export const useWeekDrag = weekDrag.use;

export async function setWeekDrag(on: boolean) {
  weekDrag.set(on);
  await prefs.set(WEEK_DRAG_KEY, on);
}

/** Once at start (app/_layout.tsx), next to the language. */
export async function loadLabs() {
  weekDrag.set(await prefs.get(WEEK_DRAG_KEY, false));
}
