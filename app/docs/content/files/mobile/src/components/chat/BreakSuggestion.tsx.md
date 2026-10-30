---
updated: 2026-10-30T15:06:00Z
---

**"Pauze samen?" in a one-to-one chat**: a break you share with that friend this school week that nobody asked for
yet (`ChatDetail.breaks`, the first with `asked: false`; computed by `api/roosters/chat.py`), as a small card at the
bottom of the conversation. `app/chat/[id].tsx` puts it in as the newest row of its inverted list, so it sits right
above the text box and scrolls with the messages (not a floating overlay), and leaves it out while the keyboard is
open. Full width like a request card (`RequestCard.tsx`) but lighter: soft yellow with the yellow 'together' edge, a
cup, one line ("Morgen 12:30–13:20 zijn jullie allebei vrij", day via `lib/breaks` `dayWord`) and the button.

## `BreakSuggestion`

`b`: the shared break; `onAsk`: the chat opens `BreakSheet` with `{kind: 'ask', day, people: [friend with that
window]}`.
