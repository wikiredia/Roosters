---
updated: 2026-10-24T10:30:00Z
---

Small parts: avatars, tags, chips, banners, selection controls.

## `AvatarProps`, `Avatar`, `AvatarStack`

Initials in one of 8 colours, with presence; overlapping stacks. With `uid` and `photo` (the version from the API) their profile photo goes over the initial (`lib/photo.photoSource`); the initial shows while it loads or when it fails. `uri`: a local photo that isn't uploaded yet.

## `Banner`

An inline note (neutral, ink, bad) with an optional action.

## `ChipProps`, `Chip`

Chips: on = chosen, sel = picked option, off = switched off (dashed). Scale a touch while pressed.

## `IconTile`

The small round icon tile in settings rows.

## `Radio`, `Check`, `Option`, `StatusOption`, `Segmented`

Selection controls.

## `Tag`

A small label (ok, premium, ink, …).

## `Badge`

The rose pill with an unread count (chat list, Chat tab); 99+ above 99.
