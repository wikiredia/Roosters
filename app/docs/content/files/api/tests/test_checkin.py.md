---
updated: 2026-10-30T13:30:00Z
---

Today's plan (`PUT /me/checkin`, `r_me.checkin`): the break part (`break_status`) and the after-school part
(`status`) change on their own and show up in Today's `me.checkin`; both cleared is no plan. "Ik ben bezig" in the
breaks: no shared break any more, the board says `break_busy`, asking is refused with reason `busy`; "Ik wil
afspreken" makes it `wants_to_chill`. The timetable for that test has a lesson at the very start and end of the
day, so "now" is always in a break.

## `_put`

Sends a plan, returns the `checkin` of the answer.
