---
updated: 2026-10-30T15:52:00Z
---

**A break or access request as a card in a chat** (`ChatMessage.kind === 'request'`), drawn by `app/chat/[id].tsx`
in its place in the history (not pinned at the bottom), full width instead of a bubble. The server sends the
request's live state with the message (`ChatMessage.request`, the viewer's view, `api/roosters/chat.py`), so the card
always shows how it stands now and only the buttons for that state. A `null` request (gone: one of you isn't friends
any more) is a dashed "Dit verzoek is er niet meer".

- **Top row**: a cup ("Pauze samen?", or "Ander uur" for a counter) or a calendar ("Mag ik je rooster zien?"), the
  state tag, and on the right Vergelijk (`swap`, label `chat.compare`) → `/compare` with the friends in the request
  (never you).
- **Facts, not sentences.** The bold line is when (or what is asked); the tag says who asked whom (Vraagt jou /
  Gevraagd), and the chat's header and the avatar say who, so a one-to-one card doesn't write the name again.
- **Break**: day + time in bold ('Vandaag 12:00–13:00', `lib/breaks.dayWord`), under it who walks (`howText`: 'Jij
  gaat erheen', 'Naar jou toe', 'Op cafetaria'), the note. Only a group request (more than one other person) names
  them: 'Van Lotte, met Amir' or 'Aan Lotte, Amir'. Tags in Today's old colours: Gepland (together), Gevraagd / Vraagt
  jou (line), Zei nee (bad); Ingetrokken and Voorbij muted, without buttons. **Niet meer mogelijk** (muted): the
  server says someone in it isn't free for the whole time any more (`possible: false`, only sent while it's open and
  nobody said no, `api/roosters/breaks.py`); no Ja / Nee / Ander uur / Toch niet, the asker keeps Weghalen. Under it
  the reason only when it's out of your hands (`blocked`): "Er werd een nieuwe les ingepland" / "Een les werd
  verplaatst". Buttons (`useAnswerBreak`): asked and
  not answered → Ja / Nee / Ander uur (`onOtherTime`: the chat opens `BreakSheet` with a counter, which itself
  navigates after sending); you said yes → Toch niet; yours → Terugnemen (Weghalen once everyone said no).
- **Access** (always one-to-one): what is asked, 'Volledig rooster' / 'Rooster zonder lokalen' → Aanvaarden / Weigeren
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

## `SkipCard`, `skipState`

"Volg je Python?" (`api/roosters/skipasks.py`): a friend asks whether you'd skip a class so you'd share a break (how
long, in yellow). The bold line is when ('Vandaag 13:00–15:00'); on your own question ('Skip je die les?') the course
comes first ('Python · Vandaag 13:00–15:00'). The one asked: 'Ik skip' (it becomes their own skip, their timetable changes) or 'Ik ga'; the asker
can take it back. The course shows only when the server sends it. Tags: Gevraagd / Voor jou, Geskipt, Gaat toch,
Ingetrokken, Voorbij (its day is over).

## `Head`, `Compare`

The top row, and Vergelijk in its corner.

## `isActiveRequest`

Whether a request card is still going: a break pending or planned (not over, taken back, declined or impossible: as
its tag says), an access request or a skip question pending. The chat pins the newest such card while it's scrolled away.

## `RequestBar`

The compact copy the chat pins at the top while the card is above everything on screen: one line with the
request in words (`lib/chat` `requestText`), its tag, and the answer when it's yours to give (Ja for a break you were
asked, Aanvaarden for access, Ik skip for a skip question) or an arrow. Tapping the rest of it scrolls to the card (`onPress`).

## `CANCELLED`, `OVER`, `IMPOSSIBLE`, `State`, `TagKind`, `T`

The muted tags, the tag's shape, the translate function's type.
