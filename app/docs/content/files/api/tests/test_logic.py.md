---
updated: 2026-10-30T15:52:00Z
---

The break rules in `logic.py`, without a database: free time only between classes, no school is not free
time, 30 minutes on the same campus vs. more across campuses, chilling extending and going home cutting
breaks, absent, partners and campus windows, Compare finding every group (also across changing groups,
not counting short overlaps), the now-board lines, travelling together, and the break part of the plan
("Bezig": no free breaks, `pauze_bezig` / `break_busy`; "Afspreken": `wants_to_chill`).

## `H`, `m`, `P`, `infos`

Helpers: 'HH:MM' → minutes, a PersonDay, DayInfos for a dict of people.
