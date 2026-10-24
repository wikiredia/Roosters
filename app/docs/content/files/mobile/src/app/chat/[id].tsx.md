---
updated: 2026-10-24T09:10:02Z
---

**One conversation** (design: Chat.dc.html B and C). Newest at the bottom (an inverted `FlatList`), older pages when
you scroll up (`useOlderMessages`). The header shows the name and, in a group, "5 leden · 2 nu vrij" (from Today's
board); the "…" opens `components/chat/ChatInfoSheet.tsx`.

- Yours blue on the right, theirs white on the left with a name and small avatar in groups when the writer changes;
  events in the middle, yellow with a cup for a planned break; a day line above each new day.
- "gelezen" (one-to-one) or "gelezen door n" (group) under your newest message the others have seen.
- **Bad wifi**: a message shows right away with "Versturen…"; when it didn't go, a red "!" and "Tik om opnieuw te
  proberen". Every try uses the same Idempotency-Key (`lib/chat.ts` `Outgoing`), so it's stored once; should the
  answer have been lost, the outgoing copy hides as soon as the server's copy is in. A refusal (not friends any
  more, too long) shows the server's reason.
- Opening it marks everything read (once per new message), which lowers the tab badge right away.
- **Long press** on a message: `components/chat/MessageSheet.tsx` (copy, report, block, take back).
- 404 (not friends any more, left the group): an empty state instead.

## `ChatScreen`

The screen. On iOS the composer moves up with the keyboard (`KeyboardAvoidingView`); on web Enter sends.

## `build`, `Item`

Messages + what's on its way → the rows of the list (day lines, who's writing, the time and "gelezen"), newest
first for the inverted list.

## `Bubble`

One row: a day line, an event, a message (taken back / removed in grey italics, no long press), or one on its way.

## `T`

The translate function's type.
