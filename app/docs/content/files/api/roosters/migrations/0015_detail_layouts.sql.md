---
updated: 2026-10-30T09:29:00Z
---

**How each student wants a lesson's details shown** (`roosters/details.py`, `r_details.py`): which fields a source
breaks into (Type, Building, Floor, Classroom, Group, ...), under which titles, merged or hidden.

## `detail_layouts`

One row per student and origin (`untis:<school_id>` or `ics:<source_id>`), written when the student checks it
(onboarding step 6 or Settings; `r_details.save`). Without a row the app uses what `details.detect` suggests.
`layout` is the JSON format of `details.py`. Rows of the same Untis origin are read (titles and structure only) to
offer schoolmates a starting point (`r_details._shared`, via `k_origin`). A calendar link's row is deleted with the
link (`r_me.delete_source`); all rows go with the account (`accounts._OWNED`), come along when a guest is folded in
(`accounts.fold_guest`) and are in the export (`lesson_details_layouts`).
