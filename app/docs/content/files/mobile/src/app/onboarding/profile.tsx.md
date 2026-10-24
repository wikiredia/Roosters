---
updated: 2026-10-24T10:30:00Z
---

**Step 2 of onboarding: your name and photo** (skippable). First and last name (saved together as
`display_name`, which friends see in chats and on Today) and a photo (`components/ProfilePhoto.tsx`). Without
it you keep the name the server made from your e-mail address ("unitme.y") or "Student"; those aren't filled in here
(`madeUp`). 'Overslaan' only skips this page and goes on to the school. The gate (`app/index.tsx`) sends
everyone without a school here first.

## `ProfileStep`

The screen.

## `madeUp`

Whether the current name is one the server made up (`api r_auth._new_user`).
