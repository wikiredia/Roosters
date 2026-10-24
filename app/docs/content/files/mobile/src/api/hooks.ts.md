---
updated: 2026-10-24T05:27:10Z
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
