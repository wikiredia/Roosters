/** Shapes of the Roosters+ API (app/api). Times of day are minutes since midnight. */

export type Tokens = { access_token: string; refresh_token: string; expires_in: number; is_new: boolean };

export type User = {
  id: number;
  display_name: string;
  email: string | null;
  locale: 'nl' | 'en';
  school_id: number | null;
  campus_id: number | null;
  avatar_color: number;
  /** Profile photo version (GET /users/{id}/photo?v=…), null: the coloured initial */
  photo?: number | null;
  ghost_until: string | null;
  onboarded: boolean;
  /** Started without signing in: own timetable yes, friends after adding an e-mail address */
  guest: boolean;
};

export type LessonState = 'normal' | 'cancelled' | 'changed' | 'extra' | 'exam' | 'removed';

export type Lesson = {
  day: string;
  start: number;
  end: number;
  busy: boolean;
  /** Missing when a friend only shares free/busy */
  course?: string;
  location?: string | null;
  state?: LessonState;
  /** theory, lab, exercises, project, support, internship, info, exam, other (api/roosters/kinds.py) */
  kind?: string;
  recently_changed?: boolean;
  /** Your own lessons only: you skip this one (PUT /me/skips). It stays on your timetable, but you're free then */
  skipped?: boolean;
};

export type StatusCode =
  | 'break'
  | 'chilling'
  | 'wants_to_chill'
  | 'in_class'
  | 'later'
  | 'done'
  | 'home'
  | 'absent'
  | 'no_classes'
  | 'hidden';

export type Status = {
  code: StatusCode;
  until?: number | null;
  can_ping?: boolean;
  next_break?: number | null;
  leaves_at?: number;
  left_at?: number;
};

/** What a friend sees of your timetable: everything, everything but the rooms, or only when you're free/busy */
export type Visibility = 'full' | 'norooms' | 'freebusy';

export type Friend = {
  id: number;
  display_name: string;
  avatar_color: number;
  photo?: number | null;
  school_id: number | null;
  campus_id: number | null;
  visibility: Visibility;
  my_visibility: Visibility;
  hidden: boolean;
};

export type Together = { id: number; start: number; end: number; same_campus: boolean };

/** A class you skip (one course, start to end of the whole block) and, after the change, who you share a break with that day */
export type Skip = { course: string; start: number; end: number };
export type SkipAnswer = { day: string; skips: Skip[]; together: Together[] };

export type Checkin = { status: 'chilling' | 'want_chill' | 'home' | 'absent'; since_min: number; until_min: number | null };

export type ScheduleChange = {
  type: 'new' | 'changed' | 'cancelled';
  day: string;
  start_min: number;
  end_min: number;
  course: string;
  location: string | null;
  old?: { day: string; start_min: number; end_min: number; course: string; location: string | null };
};

/** Meldingen: what you get a push for. Quiet hours in minutes since midnight, both or neither. */
export type PushSettings = {
  requests: boolean;
  changes: boolean;
  chat: boolean;
  quiet_from: number | null;
  quiet_until: number | null;
};

/** `device`: this phone is registered for push (signed in here and notifications allowed). */
export type Push = { settings: PushSettings; device: boolean };

export type Notification = {
  id: number;
  kind: string;
  payload: ScheduleChange & Record<string, unknown>;
  day: string | null;
  created_at: string;
  read: boolean;
};

export type BreakMode = 'i_come' | 'you_come' | 'meet';
export type BreakResponse = 'pending' | 'accepted' | 'declined';
export type BreakPerson = { id: number; display_name: string; avatar_color: number; photo?: number | null };

/** A break request ("Pauze samen?", api/roosters/breaks.py). `mode` is as the one who asked put it (i_come: they
 * come to the others). state: planned (someone said yes), declined (everyone said no), pending. */
export type BreakRequest = {
  id: number;
  day: string;
  start: number;
  end: number;
  mode: BreakMode;
  place: string | null;
  note: string | null;
  /** An answer with another time: the request it answers */
  counter_of: number | null;
  from: BreakPerson;
  mine: boolean;
  members: (BreakPerson & { response: BreakResponse })[];
  /** Yours when you were asked; null when you asked */
  my_response: BreakResponse | null;
  state: 'pending' | 'planned' | 'declined';
  now: boolean;
};

export type SourcesState = { count: number; updated_at: string | null; syncing: boolean; errors: number[] };

export type Today = {
  day: string;
  now: number;
  loading?: boolean;
  me: { status: Status; checkin: Checkin | null; lessons: Lesson[] };
  friends: Friend[];
  board: { id: number; status: Status }[];
  together: Together[];
  changes: Notification[];
  /** Break requests from and to you, today and the coming days */
  /** Missing from an API older than break requests (the app treats it as none) */
  breaks?: BreakRequest[];
  sources: SourcesState;
};

/** loading: a week far back or ahead is still being fetched from Untis (ask again in a moment) */
export type Schedule = { start: string; days: number; loading?: boolean; lessons: Lesson[]; sources: SourcesState; together?: Record<string, Together[]> };

export type FriendSchedule = {
  start: string;
  days: number;
  loading?: boolean;
  hidden: boolean;
  visibility?: Visibility;
  lessons: Lesson[];
};

export type Compare = {
  day: string;
  people: { id: number; present: boolean; free: [number, number][]; busy: [number, number][] }[];
  missing: number[];
  matches: { ids: number[]; start: number; end: number }[];
};

export type Source = {
  id: number;
  kind: 'untis' | 'ics';
  label: string;
  /** picked: `include` is exactly the courses you follow (chosen one by one; empty = none) */
  config: { include?: string[]; exclude?: string[]; keywords?: string[]; picked?: boolean };
  last_ok: string | null;
  error: string | null;
  syncing: boolean;
  class_id?: number;
  /** A class followed in one semester only (1 or 2); null = the whole school year */
  semester?: Semester | null;
};

export type School = { id: number; slug: string; name: string; short_name: string | null; country: string };
export type Campus = { id: number; name: string };
export type Semester = 1 | 2;
/** A lesson of a class's whole timetable (every course): onboarding's previews */
export type ClassLesson = { day: string; start: number; end: number; course: string; location: string | null; kind?: string; group: string | null; state: LessonState };
export type ClassLessons = { start: string; days: number; loading: boolean; lessons: ClassLesson[] };
export type SchoolClass = { id: number; name: string; long_name: string; semesters: Semester[] };
export type Terms = { s1: { start: string; end: string }; s2: { start: string; end: string }; current: Semester | null };
export type SchoolClasses = { classes: SchoolClass[]; terms: Terms };
/** syncing: the class was never fetched; scanning: the rest of the school year is still being fetched */
export type Courses = {
  syncing: boolean;
  scanning?: boolean;
  error?: string | null;
  courses: { name: string; lessons: number; semesters?: Semester[] }[];
};

export type Invite = { code: string; url: string; expires_at: string; uses: number; max_uses: number };

export type PersonCard = { id: number; display_name: string; avatar_color: number; photo?: number | null };

export type Requests = {
  incoming: { id: number; user: PersonCard }[];
  outgoing: { id: number; user: PersonCard }[];
};

export type Classmate = PersonCard & { classes: string[]; requested: boolean };

export type ChatPerson = { id: number; display_name: string; avatar_color: number; photo?: number | null };

/** An event in a chat; the app writes the sentence. `names`: everyone it mentions, by id, as they were then. */
export type ChatEvent =
  | { type: 'created'; by: number; name: string; names: Record<string, string> }
  | { type: 'added'; by: number; people: number[]; names: Record<string, string> }
  | { type: 'left'; by: number; names: Record<string, string> }
  | { type: 'renamed'; by: number; name: string; names: Record<string, string> }
  | { type: 'break_planned'; people: number[]; day: string; start: number; end: number; place: string | null; names: Record<string, string> };

export type ChatMessage = {
  id: number;
  chat_id: number;
  kind: 'text' | 'event';
  user_id: number | null;
  /** null when it was taken back (`deleted`) or removed by a moderator (`removed`) */
  body: string | null;
  payload: ChatEvent | null;
  created_at: string;
  deleted: boolean;
  removed: boolean;
};

/** A chat in the list. direct: `name`/`with_id`/`avatar_color` are the friend's; `members`: everyone but you. */
export type Chat = {
  id: number;
  kind: 'direct' | 'group';
  name: string | null;
  with_id?: number | null;
  avatar_color?: number;
  photo?: number | null;
  pinned: boolean;
  /** The bell: a push for every message in this chat (only for you, off by default) */
  push: boolean;
  unread: number;
  last_read_id: number;
  last: ChatMessage | null;
  members: ChatPerson[];
  /** People in it, you included */
  count: number;
};

/** One chat with everyone in it (you too) and how far each of them read. */
export type ChatDetail = Omit<Chat, 'last'> & {
  people: (ChatPerson & { last_read_id: number; me: boolean; friend: boolean })[];
  created_by: number;
};

export type ReportReason = 'spam' | 'mean' | 'unsafe' | 'other';
