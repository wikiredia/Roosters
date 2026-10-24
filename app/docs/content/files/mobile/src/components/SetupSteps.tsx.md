---
updated: 2026-10-24T13:30:00Z
---

Today's **'Complete the following steps'**: what onboarding skipped. Confirm your e-mail (guests), choose your school, add your timetable (a class, or a calendar link without a school), add friends (not for guests), turn on notifications (only while the phone hasn't been asked yet: `lib/push.pushState` is `undetermined`; allowed or refused by the phone counts as done, and a phone that can't get push never shows it). The notifications item opens `onboarding/notifications?from=settings`. Each step disappears when done; the card disappears with the last one.

## `Step`, `SetupSteps`

A step (title, sub line, icon, where it goes) and the card. It fades in and out (`Motion.Reveal`).
