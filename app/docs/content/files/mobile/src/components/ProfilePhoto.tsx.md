---
updated: 2026-10-24T10:30:00Z
---

**Your photo**, big, with a camera badge: 'Kies foto', 'Maak foto' (not on the web) and 'Verwijder foto' once there is
one. A picked photo is cropped square and shrunk (`lib/photo.pickPhoto`) and saved at once (`useSetPhoto`,
`PUT /api/v1/me/photo`); the local copy shows while it uploads, and goes if the upload fails. Used on the
onboarding profile step (`app/onboarding/profile.tsx`) and Profiel bewerken (`app/settings/profile.tsx`).

## `ProfilePhoto`

As above.
