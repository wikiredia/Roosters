---
updated: 2026-10-24T19:20:00Z
---

**One conversation** (design: Chat.dc.html B and C). Newest at the bottom (an inverted `FlatList`), older pages when
you scroll up (`useOlderMessages`). In the middle of the header: their photo (40 px, in line with the back
button and the "…"), with the name under it (a group: the first avatars, the name and "5 leden · 2 nu vrij" from
Today's board); tapping either opens their profile (`friends/[id]`), a group's info. The "…" opens `components/chat/ChatInfoSheet.tsx`.

- Yours blue on the right, theirs white on the left with a name and small avatar in groups when the writer changes;
  events in the middle, yellow with a cup for a planned break; a day line above each new day.
- "gelezen" (one-to-one) or "gelezen door n" (group) under your newest message the others have seen.
- **Bad wifi**: a message shows right away with "Versturen…"; when it didn't go, a red "!" and "Tik om opnieuw te
  proberen". Every try uses the same Idempotency-Key (`lib/chat.ts` `Outgoing`), so it's stored once; should the
  answer have been lost, the outgoing copy hides as soon as the server's copy is in. A refusal (not friends any
  more, too long) shows the server's reason.
- Opening it marks everything read (once per new message), which lowers the tab badge right away. While it's on
  screen its messages don't come in as a push banner (`lib/push.setOpenChat`).
- **Long press** on a message: `components/chat/MessageSheet.tsx` (copy, report, block, take back). The bubble is
  measured on screen; the whole chat slides up with the sheet (`liftY`) and the message stays bright above the scrim.
- **+** left of the box: a small menu (icon and title): Camera and Bestanden ('Binnenkort': sending photos and
  files needs attachments on the server), Vergelijk roosters (Vergelijken with everyone in the chat who's your
  friend; more than 3 is Premium there), and in a one-to-one chat Meld (their newest message, straight to the report
  form) and Blokkeer.
- New messages (yours as you send them, theirs as they arrive) slide up into place; what was there when the chat
  opened stays still.
- 404 (not friends any more, left the group): an empty state instead.

## `ChatScreen`

The screen. On iOS the composer moves up with the keyboard (`KeyboardAvoidingView`); on web Enter sends.

## `build`, `Item`

Messages + what's on its way → the rows of the list (day lines, who's writing, the time and "gelezen"), newest
first for the inverted list.

## `Bubble`

One row: a day line, an event, a message (taken back / removed in grey italics, no long press), or one on its way.
`lifted`: just the bubble, for the copy over the message sheet's scrim (`msgItem` makes that row).

## `T`

The translate function's type.
