---
updated: 2026-10-30T10:30:00Z
---

Pure helpers for the chat screens: times, the sentence for an event, the one-line preview. No hooks, no API.

## `clock`, `when`, `dayLabel`

"10:58" under a message; in the list "11:20" today, "gisteren", "ma" this week, "di 14 okt" before; above a new
day in a conversation "Vandaag", "Gisteren", "di 14 okt".

## `eventText`

The sentence for an event (`api/roosters/chat.py`: created, added, left, renamed, break_planned), with "Jij" for
you and the names as they were then (from the payload: someone who left still has a name).

## `requestText`

A request card in one line: "Pauze samen? morgen 12:30", "Ander uur: vandaag 13:00", "Mag ik je rooster zien?",
"Dit verzoek is er niet meer" (the language from the `lang` store unless given).

## `messageText`, `preview`

A message in one line (taken back / removed say so), and the chat list's line under a name: "Lotte: …", "Jij: …",
no name in a one-to-one chat; "Nog geen berichten" when empty.

## `Outgoing`, `T`

A message on its way (`key`: its Idempotency-Key, the same on every try; `sending` or `failed`), and the
translate function's type.
