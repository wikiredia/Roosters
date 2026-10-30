import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { api, ApiError } from '@/lib/api';
import { pinnedFirst } from '@/lib/friends';
import { clearSession } from '@/lib/session';
import { type SkipTarget, withSkip } from '@/lib/skips';
import { addDays, isoDay, parseDay } from '@/lib/time';

import type {
  BreakMode,
  BreakRequest,
  Campus,
  Chat,
  ChatDetail,
  ChatMessage,
  Checkin,
  Classmate,
  ClassLessons,
  Compare,
  Courses,
  DetailLayout,
  DetailOrigin,
  Friend,
  FriendSchedule,
  Invite,
  Push,
  PushSettings,
  ReportReason,
  Requests,
  Schedule,
  School,
  SchoolClasses,
  Semester,
  SkipAnswer,
  Source,
  Today,
  User,
  Visibility,
} from './types';

/** Query keys in one place, so mutations invalidate exactly what they change. */
export const keys = {
  me: ['me'] as const,
  today: (day?: string) => ['today', day ?? 'now'] as const,
  schedule: (start: string, days: number) => ['schedule', start, days] as const,
  sources: ['sources'] as const,
  details: ['details'] as const,
  friends: ['friends'] as const,
  requests: ['requests'] as const,
  invite: ['invite'] as const,
  friendSchedule: (id: number, start: string, days: number) => ['friend-schedule', id, start, days] as const,
  compare: (ids: number[], day: string) => ['compare', ids.join(','), day] as const,
  schools: ['schools'] as const,
  campuses: (school: number) => ['campuses', school] as const,
  classes: (school: number) => ['classes', school] as const,
  courses: (school: number, cls: number) => ['courses', school, cls] as const,
  classmates: ['classmates'] as const,
  breaks: ['breaks'] as const,
  chats: ['chats'] as const,
  chat: (id: number) => ['chat', id] as const,
  messages: (id: number) => ['chat-messages', id] as const,
  push: ['push'] as const,
};

// ---- Reading ------------------------------------------------------------------------

export function useMe(enabled = true) {
  return useQuery({ queryKey: keys.me, queryFn: () => api.get<{ user: User }>('/api/v1/me').then((r) => r.user), enabled });
}

export function useToday(day?: string) {
  return useQuery({
    queryKey: keys.today(day),
    queryFn: () => api.get<Today>(`/api/v1/me/today${day ? `?day=${day}` : ''}`),
    refetchInterval: (q) => (q.state.data?.loading ? 2000 : 60_000),
  });
}

/** Several days of Today side by side (Rooster, 1–5 day columns). A day far back or ahead that's still
 * being fetched from Untis (`loading`) is asked again every 2 s. */
export function useTodays(days: string[]) {
  return useQueries({
    queries: days.map((day) => ({
      queryKey: keys.today(day),
      queryFn: () => api.get<Today>(`/api/v1/me/today?day=${day}`),
      refetchInterval: (q: { state: { data?: Today } }) => (q.state.data?.loading ? 2000 : false),
    })),
  });
}

export function useSchedule(start: string, days: number) {
  return useQuery({
    queryKey: keys.schedule(start, days),
    queryFn: () => api.get<Schedule>(`/api/v1/me/schedule?start=${start}&days=${days}`),
    refetchInterval: (q) => (q.state.data?.loading ? 2000 : false),
  });
}

/** The Rooster tab: whole weeks (Monday + 7 days) with the shared breaks per day, one request per week.
 * A week far back or ahead that's still being fetched from Untis is asked again every 2 s. */
export function useWeeks(mondays: string[]) {
  return useQueries({
    queries: mondays.map((start) => ({
      queryKey: [...keys.schedule(start, 7), 'together'],
      queryFn: () => api.get<Schedule>(`/api/v1/me/schedule?start=${start}&days=7&together=1`),
      staleTime: 60_000,
      refetchInterval: (q: { state: { data?: Schedule } }) => (q.state.data?.loading ? 2000 : false),
    })),
  });
}

export function useSources() {
  return useQuery({
    queryKey: keys.sources,
    queryFn: () => api.get<{ sources: Source[] }>('/api/v1/me/sources').then((r) => r.sources),
    // While a class is being fetched for the first time, check again soon
    refetchInterval: (q) => (q.state.data?.some((s) => s.syncing) ? 2500 : false),
  });
}

/** How your lessons' details break up and how you show them, per origin (onboarding/details.tsx, the lesson sheet).
 * While a source was never fetched, asked again every few seconds (nothing to learn from yet). */
export function useDetails() {
  return useQuery({
    queryKey: keys.details,
    queryFn: () => api.get<{ origins: DetailOrigin[] }>('/api/v1/me/details').then((r) => r.origins),
    staleTime: 5 * 60_000,
    refetchInterval: (q) => (q.state.data?.some((o) => o.syncing) ? 3000 : false),
  });
}

/** Friends need a signed-in account: a guest's friend queries stay off (the API would answer 403). */
export function useSocial() {
  const me = useMe();
  return !!me.data && !me.data.guest;
}

export function useFriends() {
  return useQuery({
    queryKey: keys.friends,
    queryFn: () => api.get<{ friends: Friend[] }>('/api/v1/friends').then((r) => r.friends),
    enabled: useSocial(),
  });
}

export function useRequests() {
  return useQuery({ queryKey: keys.requests, queryFn: () => api.get<Requests>('/api/v1/friends/requests'), enabled: useSocial() });
}

export function useInvite() {
  return useQuery({
    queryKey: keys.invite,
    queryFn: () => api.post<{ invite: Invite }>('/api/v1/invites').then((r) => r.invite),
    staleTime: 60 * 60_000,
    enabled: useSocial(),
  });
}

export function useFriendSchedule(id: number, start: string, days: number) {
  return useQuery({
    queryKey: keys.friendSchedule(id, start, days),
    queryFn: () => api.get<FriendSchedule>(`/api/v1/friends/${id}/schedule?start=${start}&days=${days}`),
    refetchInterval: (q) => (q.state.data?.loading ? 2000 : false),
  });
}

export function useCompare(ids: number[], day: string) {
  return useQuery({
    queryKey: keys.compare(ids, day),
    queryFn: () => api.get<Compare>(`/api/v1/compare?ids=${ids.join(',')}&day=${day}`),
    enabled: ids.length > 0,
  });
}

/** Break requests from and to you (Today has them too, in its one request). */
export function useBreaks() {
  return useQuery({
    queryKey: keys.breaks,
    queryFn: () => api.get<{ breaks: BreakRequest[] }>('/api/v1/breaks').then((r) => r.breaks),
    enabled: useSocial(),
  });
}

// ---- Chat -------------------------------------------------------------------------

export type Chats = { chats: Chat[]; unread: number };
export type MessagePage = { messages: ChatMessage[]; more: boolean };

/** Your chats and the unread total (tab badge). Asked again every 15 s: mostly an empty "not modified". */
export function useChats() {
  return useQuery({ queryKey: keys.chats, queryFn: () => api.get<Chats>('/api/v1/chats'), enabled: useSocial(), refetchInterval: 15_000 });
}

export function useChat(id: number) {
  return useQuery({
    queryKey: keys.chat(id),
    queryFn: () => api.get<{ chat: ChatDetail }>(`/api/v1/chats/${id}`).then((r) => r.chat),
    enabled: id > 0,
    refetchInterval: 10_000,
  });
}

/** Older pages you scrolled up to, kept in front of the newest page. */
function merge(have: MessagePage | undefined, page: MessagePage): MessagePage {
  const first = page.messages[0]?.id;
  if (!have || first === undefined) return page;
  const older = have.messages.filter((m) => m.id < first);
  return { messages: [...older, ...page.messages], more: older.length ? have.more : page.more };
}

/**
 * A conversation, oldest first. While it's open the newest page is asked again every 3 s: with the ETag that's an
 * empty "not modified" until someone writes, and a message taken back disappears here too.
 */
export function useMessages(id: number) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: keys.messages(id),
    queryFn: async () => merge(qc.getQueryData<MessagePage>(keys.messages(id)), await api.get<MessagePage>(`/api/v1/chats/${id}/messages`)),
    enabled: id > 0,
    refetchInterval: 3000,
  });
}

/** The page above the oldest message you have (scrolling up). */
export function useOlderMessages(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (before: number) => api.get<MessagePage>(`/api/v1/chats/${id}/messages?before=${before}`, { etag: false }),
    onSuccess: (r) =>
      qc.setQueryData<MessagePage>(keys.messages(id), (have) => {
        const known = new Set(have?.messages.map((m) => m.id));
        return { messages: [...r.messages.filter((m) => !known.has(m.id)), ...(have?.messages ?? [])], more: r.more };
      }),
  });
}

/** Sending: `key` is the Idempotency-Key, the same on every try of this message (it's stored once). */
export function useSendMessage(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, key }: { body: string; key: string }) =>
      api.post<{ message: ChatMessage }>(`/api/v1/chats/${id}/messages`, { body }, { idemKey: key }).then((r) => r.message),
    onSuccess: (m) => {
      qc.setQueryData<MessagePage>(keys.messages(id), (have) =>
        have?.messages.some((x) => x.id === m.id) ? have : { messages: [...(have?.messages ?? []), m], more: have?.more ?? false },
      );
      qc.invalidateQueries({ queryKey: keys.chats });
    },
  });
}

/** Read up to this message: the badge goes down right away. */
export function useReadChat(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (upTo: number) => api.post(`/api/v1/chats/${id}/read`, { up_to_id: upTo }),
    onMutate: (upTo) =>
      qc.setQueryData<Chats>(keys.chats, (have) => {
        if (!have) return have;
        const chats = have.chats.map((c) => (c.id === id ? { ...c, unread: 0, last_read_id: Math.max(c.last_read_id, upTo) } : c));
        return { chats, unread: chats.reduce((n, c) => n + c.unread, 0) };
      }),
  });
}

function useChatWrite<V>(fn: (v: V) => Promise<ChatDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (c) => {
      qc.setQueryData(keys.chat(c.id), c);
      qc.invalidateQueries({ queryKey: keys.chats });
      qc.invalidateQueries({ queryKey: keys.messages(c.id) });
    },
  });
}

/** The one-to-one chat with a friend (the server makes it the first time). */
export function useOpenDirect() {
  return useChatWrite((userId: number) => api.post<{ chat: ChatDetail }>('/api/v1/chats/direct', { user_id: userId }).then((r) => r.chat));
}

export function useNewGroup() {
  return useChatWrite((v: { name: string; user_ids: number[] }) => api.post<{ chat: ChatDetail }>('/api/v1/chats', v).then((r) => r.chat));
}

/** Rename a group, or pin a chat or turn its bell on (only for you). */
export function useEditChat(id: number) {
  return useChatWrite((v: { name?: string; pinned?: boolean; push?: boolean }) => api.patch<{ chat: ChatDetail }>(`/api/v1/chats/${id}`, v).then((r) => r.chat));
}

export function useAddToChat(id: number) {
  return useChatWrite((ids: number[]) => api.post<{ chat: ChatDetail }>(`/api/v1/chats/${id}/members`, { user_ids: ids }).then((r) => r.chat));
}

export function useLeaveChat(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.del(`/api/v1/chats/${id}/members/me`),
    onSuccess: () => {
      qc.removeQueries({ queryKey: keys.chat(id) });
      qc.removeQueries({ queryKey: keys.messages(id) });
      qc.invalidateQueries({ queryKey: keys.chats });
    },
  });
}

/** Your own message, gone for everyone. */
export function useTakeBack(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: number) => api.del(`/api/v1/chats/${id}/messages/${messageId}`),
    onSuccess: (_r, messageId) => {
      qc.setQueryData<MessagePage>(keys.messages(id), (have) =>
        have ? { ...have, messages: have.messages.map((m) => (m.id === messageId ? { ...m, body: null, deleted: true } : m)) } : have,
      );
      qc.invalidateQueries({ queryKey: keys.chats });
    },
  });
}

/** "Meld dit bericht", and blocking the writer if you want (then everything changes: friends, Today, chats). */
export function useReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, ...body }: { messageId: number; reason: ReportReason; note?: string | null; block?: boolean }) =>
      api.post<{ reported: boolean; blocked: boolean }>(`/api/v1/chats/messages/${messageId}/report`, body),
    onSuccess: (r) => {
      if (r.blocked) qc.invalidateQueries();
    },
  });
}

export function useSchools() {
  return useQuery({
    queryKey: keys.schools,
    queryFn: () => api.get<{ schools: School[] }>('/api/v1/schools').then((r) => r.schools),
    staleTime: 24 * 60 * 60_000,
  });
}

export function useCampuses(school: number | null) {
  return useQuery({
    queryKey: keys.campuses(school ?? 0),
    queryFn: () => api.get<{ campuses: Campus[] }>(`/api/v1/schools/${school}/campuses`).then((r) => r.campuses),
    enabled: !!school,
    staleTime: 24 * 60 * 60_000,
  });
}

export function useClasses(school: number | null) {
  return useQuery({
    queryKey: keys.classes(school ?? 0),
    queryFn: () => api.get<SchoolClasses>(`/api/v1/schools/${school}/classes`),
    enabled: !!school,
    staleTime: 60 * 60_000,
  });
}

/** The courses of a class this school year; with a semester, only the ones in that semester. */
export function useCourses(school: number | null, cls: number, semester?: Semester | null) {
  return useQuery({
    queryKey: [...keys.courses(school ?? 0, cls), semester ?? 0],
    queryFn: () => api.get<Courses>(`/api/v1/schools/${school}/classes/${cls}/courses${semester ? `?semester=${semester}` : ''}`),
    enabled: !!school,
    // A class never fetched before: the server fetches it now, we ask again every 2 s.
    // The rest of the year takes longer (a request per week): every 4 s.
    refetchInterval: (q) => (q.state.data?.syncing ? 2000 : q.state.data?.scanning ? 4000 : false),
  });
}

/** A class's whole timetable for some days (every course, not only yours): onboarding's previews.
 * One query per class; far weeks poll while the API fetches them (`loading`). */
export function useClassLessons(school: number | null, classes: number[], start: string, days: number) {
  return useQueries({
    queries: classes.map((cls) => ({
      queryKey: ['class-lessons', school ?? 0, cls, start, days],
      queryFn: () => api.get<ClassLessons>(`/api/v1/schools/${school}/classes/${cls}/lessons?start=${start}&days=${days}`),
      enabled: !!school && !!cls,
      staleTime: 5 * 60_000,
      refetchInterval: (q: { state: { data?: ClassLessons } }) => (q.state.data?.loading ? 2000 : false),
    })),
  });
}

export function useClassmates() {
  return useQuery({
    queryKey: keys.classmates,
    queryFn: () => api.get<{ classmates: Classmate[] }>('/api/v1/classmates').then((r) => r.classmates),
    enabled: useSocial(),
  });
}

// ---- Writing ------------------------------------------------------------------------

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Pick<User, 'display_name' | 'locale' | 'school_id' | 'campus_id' | 'avatar_color'>> & {
      onboarded?: boolean;
    }) => api.patch<{ user: User }>('/api/v1/me', body).then((r) => r.user),
    onSuccess: (user) => qc.setQueryData(keys.me, user),
  });
}

/** Your profile photo: a square JPEG (base64), or null to go back to the coloured initial. */
export function useSetPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jpeg: string | null) =>
      (jpeg ? api.put<{ user: User }>('/api/v1/me/photo', { jpeg }) : api.del<{ user: User }>('/api/v1/me/photo')).then((r) => r.user),
    onSuccess: (user) => qc.setQueryData(keys.me, user),
  });
}

export function useCheckin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: Checkin['status'] | null) =>
      api.put<{ checkin: Checkin | null }>('/api/v1/me/checkin', { status }).then((r) => r.checkin),
    // Show the choice right away; the server confirms (or the retry does) later
    onMutate: async (status) => {
      await qc.cancelQueries({ queryKey: keys.today() });
      const prev = qc.getQueryData<Today>(keys.today());
      if (prev) {
        qc.setQueryData<Today>(keys.today(), {
          ...prev,
          me: { ...prev.me, checkin: status ? { status, since_min: prev.now, until_min: null } : null },
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(keys.today(), ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ['today'] }),
  });
}

/**
 * Skip a class, or take that back (`skipped: false`). Your timetable and Today change at once (the cache, before the
 * server answers), so the card is gone the moment it lands in the bin and Undo puts it back the moment you tap it.
 * The requests go one after the other (an Undo never overtakes its skip on slow wifi); each answer brings who you now
 * share a break with that day (for the summary, components/timetable/SkipToast.tsx), then everything is asked again.
 */
export function useSkip() {
  const qc = useQueryClient();
  return (v: SkipTarget & { skipped: boolean }): Promise<SkipAnswer> => {
    qc.cancelQueries({ queryKey: ['schedule'] });
    qc.cancelQueries({ queryKey: ['today'] });
    qc.setQueriesData<Schedule>({ queryKey: ['schedule'] }, (d) => d && { ...d, lessons: withSkip(d.lessons, v, v.skipped) });
    qc.setQueriesData<Today>({ queryKey: ['today'] }, (d) => d && { ...d, me: { ...d.me, lessons: withSkip(d.me.lessons, v, v.skipped) } });
    skipsPending++;
    const run = skipQueue.then(() => api.put<SkipAnswer>('/api/v1/me/skips', v));
    skipQueue = run.then(
      (r) => {
        qc.setQueriesData<Schedule>({ queryKey: ['schedule'] }, (d) => {
          if (!d?.together || r.day < d.start || r.day >= isoDay(addDays(parseDay(d.start), d.days))) return d;
          return { ...d, together: { ...d.together, [r.day]: r.together } };
        });
      },
      () => {},
    );
    skipQueue.then(() => {
      // Ask again once the last one is through (earlier answers would undo what's still on its way)
      if (--skipsPending) return;
      qc.invalidateQueries({ queryKey: ['schedule'] });
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['compare'] });
    });
    return run;
  };
}
let skipQueue: Promise<unknown> = Promise.resolve();
let skipsPending = 0;

export function useGhost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (minutes: number) => api.put<{ user: User }>('/api/v1/me/ghost', { minutes }).then((r) => r.user),
    onSuccess: (user) => qc.setQueryData(keys.me, user),
  });
}

export function useAddClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { class_id: number; semester?: Semester | null; include?: string[]; exclude?: string[] }) =>
      api.post<{ source: Source }>('/api/v1/me/sources/untis', body).then((r) => r.source),
    // A new class (or link) can be a new origin of lesson details
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.sources });
      qc.invalidateQueries({ queryKey: keys.details });
    },
  });
}

export function useAddIcs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { url: string; label?: string }) =>
      api.post<{ source: Source }>('/api/v1/me/sources/ics', body).then((r) => r.source),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.sources });
      qc.invalidateQueries({ queryKey: keys.details });
    },
  });
}

export function useUpdateSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; include?: string[]; exclude?: string[]; picked?: boolean }) =>
      api.patch<{ source: Source }>(`/api/v1/me/sources/${id}`, body).then((r) => r.source),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.sources });
      qc.invalidateQueries({ queryKey: ['schedule'] });
      qc.invalidateQueries({ queryKey: ['today'] });
    },
  });
}

/** 'Looks right': saves your layout for one origin; the answer replaces that origin in the cached list. */
export function useSaveDetails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ origin, layout }: { origin: string; layout: DetailLayout }) =>
      api.put<{ origin: DetailOrigin }>(`/api/v1/me/details/${encodeURIComponent(origin)}`, { layout }).then((r) => r.origin),
    onSuccess: (o) => qc.setQueryData<DetailOrigin[]>(keys.details, (list) => list?.map((x) => (x.origin === o.origin ? o : x))),
  });
}

export function useDeleteSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/api/v1/me/sources/${id}`),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useRefresh() {
  return useMutation({ mutationFn: () => api.post('/api/v1/me/refresh') });
}

/** How long the Rooster tab's refresh button waits for the sources to answer before it gives up spinning */
const REFRESH_WAIT = 40_000;

/**
 * The refresh button on the Rooster tab: asks the API to fetch my classes and calendar links again from where they
 * come from (Untis, the .ics links), not just to send what it has. That runs as a job, so after the request goes
 * through the sources are polled until each has a newer `last_ok` (or a new error); then the timetable queries are
 * fetched again. `busy` is true meanwhile. Within the API's cooldown (90 s) it answers 429: the timetable was just
 * refreshed, so only the fetch from the API is done.
 */
export function useSourceRefresh() {
  const qc = useQueryClient();
  const sources = useSources();
  const post = useRefresh();
  const [waiting, setWaiting] = useState<Record<number, { ok: string | null; error: string | null }> | null>(null);
  const refetchTimetable = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['schedule'] });
    qc.invalidateQueries({ queryKey: ['today'] });
  }, [qc]);
  // Every source has been fetched again since the button was pressed (or failed doing it)
  const finished = !!waiting && !!sources.data && sources.data.every((s) => !waiting[s.id] || s.last_ok !== waiting[s.id].ok || (!!s.error && !waiting[s.id].error));
  const pending = !!waiting && !finished;
  useEffect(() => {
    if (finished) refetchTimetable();
  }, [finished, refetchTimetable]);
  useEffect(() => {
    if (!pending) return;
    const poll = setInterval(() => qc.invalidateQueries({ queryKey: keys.sources }), 2000);
    const stop = setTimeout(() => {
      setWaiting(null);
      refetchTimetable();
    }, REFRESH_WAIT);
    return () => {
      clearInterval(poll);
      clearTimeout(stop);
    };
  }, [pending, qc, refetchTimetable]);
  const run = useCallback(() => {
    if (pending || post.isPending) return;
    const before = Object.fromEntries((sources.data ?? []).map((s) => [s.id, { ok: s.last_ok, error: s.error }]));
    post.mutate(undefined, {
      onSuccess: () => setWaiting(before),
      onError: (e) => {
        if (e instanceof ApiError && e.status === 429) refetchTimetable();
      },
    });
  }, [pending, post, sources.data, refetchTimetable]);
  return { run, busy: post.isPending || pending };
}

export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.post<{ friend: Friend }>(`/api/v1/invites/${encodeURIComponent(code)}/accept`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.friends });
      qc.invalidateQueries({ queryKey: ['today'] });
    },
  });
}

export function useResetInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ invite: Invite }>('/api/v1/invites?reset=true').then((r) => r.invite),
    onSuccess: (inv) => qc.setQueryData(keys.invite, inv),
  });
}

export function useFriendRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => api.post<Requests>('/api/v1/friends/requests', { user_id: userId }),
    onSuccess: (r) => {
      qc.setQueryData(keys.requests, r);
      qc.invalidateQueries({ queryKey: keys.classmates });
      qc.invalidateQueries({ queryKey: keys.friends });
    },
  });
}

export function useAnswerRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'accept' | 'decline' | 'cancel' }) =>
      api.post<Requests>(`/api/v1/friends/requests/${id}/${action}`),
    onSuccess: (r) => {
      qc.setQueryData(keys.requests, r);
      qc.invalidateQueries({ queryKey: keys.friends });
      qc.invalidateQueries({ queryKey: ['today'] });
    },
  });
}

type BreakAnswer = { breaks: BreakRequest[]; break: BreakRequest | null };

/** Every break write answers with the whole list: it replaces ours, and Today asks again for its copy. */
function useBreakWrite<V>(fn: (v: V) => Promise<BreakAnswer>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      qc.setQueryData(keys.breaks, r.breaks);
      qc.invalidateQueries({ queryKey: ['today'] });
    },
  });
}

/** "Pauze samen?" to one or more friends. */
export function useAskBreak() {
  return useBreakWrite((body: { to_ids: number[]; day: string; start: number; end: number; mode: BreakMode; place?: string | null; note?: string | null }) =>
    api.post<BreakAnswer>('/api/v1/breaks', body),
  );
}

/** Yes / no to a request you got, another time instead, or taking back your own. */
export function useAnswerBreak() {
  return useBreakWrite(
    (a: { id: number; action: 'accepted' | 'declined' } | { id: number; action: 'counter'; start: number; end: number; place?: string | null; note?: string | null } | { id: number; action: 'cancel' }) =>
      a.action === 'cancel'
        ? api.post<BreakAnswer>(`/api/v1/breaks/${a.id}/cancel`)
        : a.action === 'counter'
          ? api.post<BreakAnswer>(`/api/v1/breaks/${a.id}/counter`, { start: a.start, end: a.end, place: a.place, note: a.note })
          : api.post<BreakAnswer>(`/api/v1/breaks/${a.id}/respond`, { response: a.action }),
  );
}

export function useSetVisibility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, visibility }: { id: number; visibility: Visibility }) =>
      api.patch(`/api/v1/friends/${id}`, { visibility }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.friends }),
  });
}

/** Pin a friend (or not), only for you. Shown at once, the lists re-sorted (pinned first); put back if the server
 * says no. Today's board and the Rooster tab's shared breaks sort on it too, so they're asked again after. */
export function usePinFriend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pinned }: { id: number; pinned: boolean }) =>
      api.patch<{ friend: Friend }>(`/api/v1/friends/${id}`, { pinned }).then((r) => r.friend),
    onMutate: async ({ id, pinned }) => {
      await qc.cancelQueries({ queryKey: keys.friends });
      const before = qc.getQueryData<Friend[]>(keys.friends);
      const flip = (f: Friend) => (f.id === id ? { ...f, pinned } : f);
      if (before) qc.setQueryData<Friend[]>(keys.friends, pinnedFirst(before.map(flip)));
      qc.setQueriesData<Today>({ queryKey: ['today'] }, (d) => d && { ...d, friends: pinnedFirst(d.friends.map(flip)) });
      return { before };
    },
    onError: (_e, _v, ctx) => ctx?.before && qc.setQueryData(keys.friends, ctx.before),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.friends });
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['schedule'] });
    },
  });
}

export function useRemoveFriend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/api/v1/friends/${id}`),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post('/api/v1/blocks', { user_id: id }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

// ---- Push ---------------------------------------------------------------------------

/** Meldingen: the categories, quiet hours, and whether this phone is registered. */
export function usePush() {
  return useQuery({ queryKey: keys.push, queryFn: () => api.get<Push>('/api/v1/me/push') });
}

/** Only what changed; shown at once, put back if the server says no. */
export function useSetPush() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: Partial<PushSettings>) => api.patch<Push>('/api/v1/me/push', v),
    onMutate: (v) => {
      const before = qc.getQueryData<Push>(keys.push);
      if (before) qc.setQueryData<Push>(keys.push, { ...before, settings: { ...before.settings, ...v } });
      return { before };
    },
    onError: (_e, _v, ctx) => ctx?.before && qc.setQueryData(keys.push, ctx.before),
    onSuccess: (r) => qc.setQueryData(keys.push, r),
  });
}

// ---- Account ------------------------------------------------------------------------

/** Sign out here (or on every device). Without network we still forget the tokens on this phone. */
export async function signOut(everywhere = false) {
  try {
    await api.post(everywhere ? '/api/v1/auth/logout-all' : '/api/v1/auth/logout');
  } catch {
    if (everywhere) throw new Error('offline');
  }
  await clearSession();
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: () => api.del('/api/v1/me'),
    onSuccess: () => clearSession(),
  });
}

export function exportData() {
  return api.get<Record<string, unknown>>('/api/v1/me/export');
}
