---
updated: 2026-10-24T19:20:00Z
---

The **tab bar**: Rooster (first, where the app opens), Today, Chat, Me (a custom bar with the brand's active pill). Signed out → welcome. An invite opened before signing in is accepted here once signed in. Push (`lib/push.ts`): signed in, this phone's
token goes to the server (`registerPush`, without asking: asking is for Meldingen), and a push that opened the app, or
is tapped while it runs, opens what it's about (`handlePushResponses`): here, so it lands on top of the tabs.

## `TABS`, `TabBar`

Tab icons and labels, and the bar itself (accessible as a tablist). The Chat tab carries a rose badge with your
unread messages (`useChats`, asked every 15 s; screen readers hear the number too).

## `TabsLayout`

The tabs plus the hidden `compare` screen (history back behaviour; the bar lights Rooster there) (switching cross-fades), the pending-invite check, and push.
