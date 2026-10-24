---
updated: 2026-10-24T12:55:00Z
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
back. Every write answers with the whole list: it replaces `keys.breaks` and Today asks again (Today carries the
requests too, in its one request).

## `useAcceptInvite`, `useResetInvite`, `useFriendRequest`, `useAnswerRequest`, `useSetVisibility`, `useRemoveFriend`, `useBlock`

Social writes.

## `useAddClass`, `useAddIcs`, `useUpdateSource`, `useDeleteSource`, `useRefresh`

Timetable sources and the manual refresh.

## `useFriends`, `useRequests`, `useInvite`, `useFriendSchedule`, `useCompare`, `useClassmates`

Friends, requests, your invite link, a friend's week, Compare, classmates.

## `useWeeks`

The Rooster tab: whole weeks with the shared breaks per day (`/me/schedule?together=1`), one request per week;
polls while a far week is `loading`.

## `useMe`, `useToday`, `useTodays`, `useSchedule`, `useSources`

Your account, Today (refetched every minute), several days side by side (Rooster tab), a week, your sources (polled every 2.5 s while one is still fetching for the first time). Today, several days, a week and a friend's schedule poll every 2 s while the API says `loading` (a week far back or ahead is being fetched from Untis).

## `useClassLessons`

A class's whole timetable for some days, one query per class (onboarding's previews); polls while `loading`.

## `useSchools`, `useCampuses`, `useClasses`, `useCourses`

Onboarding lists (ETag-cached, filtered offline). `useClasses` returns `{classes, terms}`; `useCourses` takes an optional semester and polls every 2 s while the class is fetched for the first time, every 4 s while the rest of the year is scanned.

## `useSocial`

True for a signed-in non-guest: enables the friend queries.

## `useUpdateMe`, `useCheckin`, `useGhost`

Profile (also `onboarded`), today's check-in, ghost mode.

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
