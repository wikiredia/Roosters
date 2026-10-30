---
updated: 2026-10-30T15:00:00Z
---

**Every API call the screens make**, as TanStack Query hooks: reads (`useX`) and writes (mutations that
update or invalidate exactly what they change). Screens should use these, not `api` directly.

- `keys` holds every query key in one place.
- Social hooks (friends, requests, invite, classmates) are **disabled for guests** (`useSocial`); the API
  would answer 403.

## `keys`

Query keys per resource.

## `signOut`, `useDeleteAccount`, `exportData`

Sign out here or everywhere (offline still forgets the tokens here), delete the account, download your data.

## `useChats`, `useChat`, `Chats`

Your chats with the unread total (tab badge; asked every 15 s, off for guests), and one chat with everyone in it
and how far they read (every 10 s while it's open: "gelezen").

## `useMessages`, `useOlderMessages`, `merge`, `MessagePage`

A conversation, oldest first. While it's open the **newest page** is asked every 3 s: with the ETag that's an empty
"not modified" until someone writes, and a message taken back disappears here too. Older pages you scrolled up to
(`useOlderMessages`, `before=`) stay in front of it (`merge`).

## `useSendMessage`

Sends with the Idempotency-Key the screen gives (the same on every try of one message) and adds the answer to the
conversation right away.

## `useReadChat`

Read up to a message; the badge goes down before the server answers.

## `useOpenDirect`, `useNewGroup`, `useEditChat`, `useAddToChat`, `useLeaveChat`, `useChatWrite`

Opening the one-to-one chat with a friend, a new group, rename / pin / the bell (`push`), adding friends, leaving. Writes that answer
with the chat put it in `keys.chat` and refresh the list and the conversation.

## `useTakeBack`, `useReport`

Taking your own message back (shown as deleted right away), and "Meld dit bericht" (blocking too refreshes
everything: friends, Today, chats).

## `useBreaks`, `useAskBreak`, `useAnswerBreak`, `useBreakWrite`, `BreakAnswer`

Break requests (`/api/v1/breaks`): the list (off for guests), asking, and yes / no / another time / taking it
back. Every write answers with the whole list: it replaces `keys.breaks` and Today and the chats ask again (Today
carries the requests too, in its one request; a chat shows each request as a card). Asking and 'Ander uur' also
answer `chats`: the chats the card went to, so the app can open that chat.

## `useAskAccess`, `useAnswerAccess`

Access requests (`POST /friends/{id}/access`, `POST /access/{id}/{action}`): ask a friend to see more of their
timetable (the answer has the chat its card went to), say yes / no to one, or take yours back. A yes changes what
you show them, so friends and their timetables are asked again.

## `useAcceptInvite`, `useResetInvite`, `useFriendRequest`, `useAnswerRequest`, `useSetVisibility`, `useRemoveFriend`, `useBlock`

Social writes.

## `usePinFriend`

Pin a friend or not (`PATCH /friends/{id}` `{pinned}`, only for you). Optimistic like `useSetPush`: the friends
list and every cached Today get the new pin at once, re-sorted with `lib/friends.pinnedFirst`; put back if the
server says no. Afterwards friends, Today and the Rooster weeks are asked again (the server sorts the board and the
shared breaks on it too).

## `useAddClass`, `useAddIcs`, `useUpdateSource`, `useDeleteSource`, `useRefresh`

Timetable sources and the manual refresh (`POST /me/refresh`: the API queues a sync of every class and link). Adding a
class or link also refetches the lesson details (it can be a new origin).

## `useDetails`, `useSaveDetails`

How your lessons' details break up and how you show them, per origin (`GET /me/details`, `api/roosters/r_details.py`):
used by the onboarding step `app/onboarding/details.tsx` and the lesson sheet. Fresh for 5 minutes, saved on the phone
(`lib/query.shouldPersist`), polled every 3 s while an origin has nothing fetched yet. Saving (`PUT
/me/details/<origin>`) puts the answer in the cached list.

## `useSourceRefresh`

The Rooster tab's refresh button. Posts `useRefresh`, then asks `GET /me/sources` every 2 s until every source has a newer
`last_ok` (or a new error) than when the button was pressed, for 40 s at most (`REFRESH_WAIT`), and then fetches
`['schedule']` and `['today']` again. `busy` is true meanwhile (the arrow turns). A 429 (`refresh_cooldown`: refreshed
less than 90 s ago) only fetches our API again.

## `useFriends`, `useRequests`, `useInvite`, `useFriendSchedule`, `useCompare`, `useClassmates`

Friends, requests, your invite link, a friend's week, Compare, classmates.

## `useWeeks`

The Rooster tab: whole weeks with the shared breaks per day (`/me/schedule?together=1`), one request per week;
polls while a far week is `loading`.

## `useMe`, `useToday`, `useTodays`, `useSchedule`, `useSources`

Your account (each answer also tells `lib/server.setDebugAccount` whether it's the owner's account), Today (refetched every minute), several days side by side (Rooster tab), a week, your sources (polled every 2.5 s while one is still fetching for the first time). Today, several days, a week and a friend's schedule poll every 2 s while the API says `loading` (a week far back or ahead is being fetched from Untis).

## `useClassLessons`

A class's whole timetable for some days, one query per class (onboarding's previews); polls while `loading`.

## `useSchools`, `useCampuses`, `useClasses`, `useCourses`

Onboarding lists (ETag-cached, filtered offline). `useClasses` returns `{classes, terms}`; `useCourses` takes an optional semester and polls every 2 s while the class is fetched for the first time, every 4 s while the rest of the year is scanned.

## `useSocial`

True for a signed-in non-guest: enables the friend queries.

## `useUpdateMe`, `useCheckin`, `useGhost`

Profile (also `onboarded`), today's plan (`useCheckin`: send `{status}` for after school / the day or
`{break_status}` for your breaks; only what's sent changes, shown at once), ghost mode.

## `usePush`, `useSetPush`

Meldingen (`GET/PATCH /api/v1/me/push`, `keys.push`): the categories, quiet hours, and `device` (this phone is
registered). `useSetPush` sends only what changed and shows it at once; a refusal puts the old settings back.

## `useSetPhoto`

Your profile photo: a square JPEG as base64 (`PUT /api/v1/me/photo`), or null to remove it; updates `me`.

## `useSkip`

Skip a class or take that back. Changes the cached timetable and Today at once (`lib/skips.withSkip`), so the card is
gone the moment it lands in the bin and Undo is instant; the requests then go one after the other (`skipQueue`: an
Undo never overtakes its skip on slow wifi). Each answer puts that day's shared breaks in the cached week (for the
summary); once the last one is through (`skipsPending`), schedules, Today and Compare are asked again.
