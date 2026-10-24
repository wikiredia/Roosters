---
updated: 2026-10-24T10:30:00Z
---

**Long press on a message** (design: Chat.dc.html C): copy; someone else's message: "Meld dit bericht" (why, an
optional note, and blocking the writer too) or block the writer; your own: delete for everyone. The sheet says that
the other person never sees a report or block: reporting and blocking are required by the App Store and Play for
apps with chat. Blocking in a one-to-one chat ends the friendship, so the chat closes.

With `lift` (the chat passes where the message is on screen and its sheet values) the chat behind slides up with the
sheet until the message sits just above it, and a copy of the message is drawn over the scrim in the same place:
everything else dims, the message stays bright. `startAt="report"` opens on the report form (the chat's + → Melden).

## `MessageSheet`

Three steps in one sheet: the menu, the report form, thanks. Starts over (at `startAt`) each time it opens.

## `MenuRow`, `REASONS`

A row of the menu (icon on the right, red for blocking and deleting), and the report reasons in the order shown.

## `liftBy`, `Rect`, `Lift`

How far the chat moves up (UI thread, every frame): so the message's bottom is 16 px above the sheet, never above the
header (`minTop`), 0 when it's already clear. `Rect`: the message on screen (`measureInWindow`). `Lift`: what the
chat passes.

## `Lifted`

The copy of the message over the scrim, moving with the chat.
