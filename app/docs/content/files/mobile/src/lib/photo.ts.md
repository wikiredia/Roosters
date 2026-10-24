---
updated: 2026-10-24T10:30:00Z
---

**Profile photos** on the phone. The API side is `api/roosters/r_me.py` (`put_photo`) and `r_friends.photo`.

## `photoSource`

The image source for someone's photo: `GET /api/v1/users/{id}/photo?v=<photo>` with the access token. The
version is in the URL, so a new photo is a new image for the phone's cache. `ui/Bits.Avatar` uses it when it gets
`uid` and `photo`.

## `pickPhoto`

Library or camera (`expo-image-picker`, square crop), then the middle square if the picker didn't crop, shrunk to
256×256 JPEG (`expo-image-manipulator`): base64, ~20–40 KB, or null when cancelled or not allowed.
