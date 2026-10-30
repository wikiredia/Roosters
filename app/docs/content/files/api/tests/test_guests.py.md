---
updated: 2026-10-30T09:30:00Z
---

Guests and skippable onboarding: a guest can use their own timetable; guests get no friend features (but
can preview an invite); guests never show up for others; signing in **keeps** the guest account (`account: guest`);
signing in to an existing account **folds** the guest in (`account: existing`) (and an existing timetable wins); a signed-in
user signing in again is never merged; turned-off accounts are locked out; cleanup removes guests with no
session left.

## `guest`, `verify_as`

Create a guest; sign in by e-mail code while sending the guest's token (what the app does).
