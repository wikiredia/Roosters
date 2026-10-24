---
updated: 2026-10-24T08:00:00Z
---

**What kind of lesson** something is (theory, lab, exercises, project, support, internship, info, exam, other):
the colour in the app. Untis has no field for it. Researched on real AP timetables (Oct 2026), schools put it in
the period's free text (`lessonText`: "Theorie", "Labo", "Labo - Minor Robotics", "oefeningen", "workshop: …",
"stage", "WPL extern", "Groepsleren", "Infosessie …"), sometimes in the subject ("Lab algemene chemie 1 (PR)",
"…_PR", "Monitoraat 1CH", "Werkplekleren 3"), and in the period's `is` flags (exam, event). `untis.parse_week`
and `ics.parse` call it when a lesson is fetched; **only the result is stored**, never the free text.

Lessons that say nothing are `other` (a plain 'Les' in the app), not theory: guessing theory made everything
look the same.

## `classify`

The kind from the texts, most telling first (free text, then the subject's long and short name); `exam`/`event`
flags win or fill in. Accents don't matter.

## `KINDS`, `_RULES`, `_plain`

The kinds; the patterns in order (the first match wins, so "Labo - Minor Start-Up" is a lab); accent stripping.
To add a word a school uses: add it to the right pattern and a line to `tests/test_kinds.py`.
