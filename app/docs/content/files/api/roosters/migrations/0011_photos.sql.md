---
updated: 2026-10-24T10:30:00Z
---

**Profile photos.** `users.photo_v`: the version of your photo (NULL: none, the app shows the coloured initial); it
goes up with every new photo so phones can cache each version for good. `user_photos`: the JPEG itself (one row per
user, a few dozen KB), served by `r_friends.photo` and deleted with the account (`accounts._OWNED`).
