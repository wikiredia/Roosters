---
updated: 2026-10-30T10:30:00Z
---

**A break or access request as a card in a chat** (`ChatMessage.kind === 'request'`), drawn by `app/chat/[id].tsx`
in its place in the history (not pinned at the bottom), full width instead of a bubble. The server sends the
request's live state with the message (`ChatMessage.request`, the viewer's view, `api/roosters/chat.py`), so the card
always shows how it stands now and only the buttons for that state. A `null` request (gone: one of you isn't friends
any more) is a dashed "Dit verzoek is er niet meer".

- **Top row**: a cup ("Pauze samen?", or "Ander uur" for a counter) or a calendar ("Mag ik je rooster zien?"), the
  state tag, and on the right Vergelijk (`swap`, label `chat.compare`) → `/compare` with the friends in the request
  (never you).
- **Break**: who asked whom ("Lotte vraagt jou (en Amir)", "Jij vroeg Lotte en Amir"), day + time and who walks
  (`lib/breaks` `dayWord`, `howText`), the note. Tags in Today's old colours: Gepland (together), Gevraagd / Vraagt
  jou (line), Zei nee (bad); Ingetrokken and Voorbij muted, without buttons. Buttons (`useAnswerBreak`): asked and
  not answered → Ja / Nee / Ander uur (`onOtherTime`: the chat opens `BreakSheet` with a counter, which itself
  navigates after sending); you said yes → Toch niet; yours → Terugnemen (Weghalen once everyone said no).
- **Access**: "Lotte vraagt je volledige rooster / je rooster zonder lokalen te zien" → Aanvaarden / Weigeren
  (`useAnswerAccess`; a yes sets what you show them); yours pending → Terugnemen; afterwards the outcome as a tag
  (Aanvaard, Geweigerd, Ingetrokken).
- A refused answer shows the server's message under the buttons.

## `RequestCard`

The card for one message: `me` is your id (in a request you were asked for, the members include you),
`onOtherTime` opens "Ander uur".

## `BreakCard`, `breakState`

A break request; its tag: cancelled and over first, then what you said (asked) or how it stands (yours).

## `AccessCard`, `accessState`

An access request and its tag.

## `Head`, `Compare`

The top row, and Vergelijk in its corner.

## `CANCELLED`, `OVER`, `State`, `TagKind`, `T`

The muted tags, the tag's shape, the translate function's type.
