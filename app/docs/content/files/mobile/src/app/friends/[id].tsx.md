---
updated: 2026-10-30T10:27:00Z
---

**One friend**: their status now under their name (from Today's board, `lib/status.statusLine`, the same line as
on Vandaag; nothing when they aren't on the board), chat with them (their one-to-one chat, made the first time), their week (full, without rooms or free/busy, as they chose, with a line saying so), what you show them (the same
three choices), pin them ('Vastzetten · {name} staat altijd bovenaan, alleen voor jou', a toggle like a chat's, design
Ik-1.dc.html C; `usePinFriend`), remove or block.

**Asking for more**: when they show you less than everything (`Friend.visibility` is what *they* show *you*;
`my_visibility` is yours), 'Vraag om hun volledige rooster' (and, when they show only free/busy, 'zonder lokalen')
under their week: `useAskAccess` → `POST /friends/{id}/access`, a card in your direct chat, and the app goes there
(`router.push('/chat/<chat_id>')`). A refusal (`access_dup`: one is still open; `access_has`) shows the server's
message under the buttons.

## `FriendScreen`

As above.

## `StatusText`

Their status line ('**Vrij** tot 12:30'), centred under the name.

The page sits a little higher (less room above the photo), and their week is sized so it ends at the bottom of the
screen: the week's top is measured on screen (`measureInWindow`) and the hours share what's left (`WEEK_CHROME`:
labels, padding, margin), 24–56 px an hour.

## `WEEK_CHROME`

The room around the week's hours.
