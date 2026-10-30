/** Shapes of the Roosters+ API (app/api). Times of day are minutes since midnight. */

/** account: what the sign-in did. existing = an account that was already there (also found through the same
 * verified address), guest = this phone's guest account became the account, new = a new account (api r_auth._answer) */
export type Tokens = { access_token: string; refresh_token: string; expires_in: number; is_new: boolean; account?: 'new' | 'existing' | 'guest' };

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
  /** The owner's account (api/roosters/debug.allowed): the debug tools work for it on every server and build */
  debug?: boolean;
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
  /** Whose layout breaks up its details: 'untis:<school>' or 'ics:<source>' (DetailOrigin.origin) */
  origin?: string;
  /** Untis' student group ("1CH_A") */
  group?: string | null;
};

export type StatusCode =
  | 'break'
  | 'chilling'
  | 'wants_to_chill'
  /** In a break, but said they're busy (Checkin.break_status) */
  | 'break_busy'
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
  /** You pinned them: on top wherever friends are listed. Only yours; they never see it */
  pinned: boolean;
  hidden: boolean;
};

export type Together = { id: number; start: number; end: number; same_campus: boolean };

/** A class you skip (one course, start to end of the whole block) and, after the change, who you share a break with that day */
export type Skip = { course: string; start: number; end: number };
export type SkipAnswer = { day: string; skips: Skip[]; together: Together[] };

/** Your plan for today. `status`: after school (chilling / want_chill: you stay; home: you left at `since_min`;
 * absent: not there today), null when you didn't say. `break_status`: your breaks between classes today
 * (want_chill: you'd like company; busy: don't count on me), null when you didn't say. */
export type Checkin = {
  status: 'chilling' | 'want_chill' | 'home' | 'absent' | null;
  break_status: 'want_chill' | 'busy' | null;
  since_min: number;
  until_min: number | null;
};

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
  /** cancelled: the one who asked took it back (only seen on a card in a chat) */
  state: 'pending' | 'planned' | 'declined' | 'cancelled';
  now: boolean;
  /** Its time has passed (only seen on a card in a chat: Today's lists leave those out) */
  over?: boolean;
  /** Not over and not cancelled, but someone in it isn't free then any more (only on a card in a chat). */
  possible?: boolean;
  /** Why not, only when it's out of everyone's hands: a new lesson was scheduled, or a lesson moved. null: no reason
   * is given (someone skipped less, went home, said they're busy …) */
  blocked?: 'new_lesson' | 'moved' | null;
};

/** "Mag ik je rooster zien?": a friend asks to see more of your timetable (`visibility`: what they ask for).
 * Accepting sets what you show them to that. `mine`: you asked. */
export type AccessRequest = {
  id: number;
  from: BreakPerson;
  to: BreakPerson;
  mine: boolean;
  visibility: 'full' | 'norooms';
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  created_at: string;
};

/**
 * "Volg je Python?" (api skipasks.py): in Vergelijken `from` dragged one of `to`'s classes (day, start, end) into the
 * bin, asking whether they'd skip it; then they'd share `minutes` of break. `course`: null for the asker when `to`
 * only shows when they're free. While pending only the asker sees the class as skipped; a yes makes it `to`'s own skip.
 */
export type SkipRequest = {
  id: number;
  from: BreakPerson;
  to: BreakPerson;
  mine: boolean;
  day: string;
  start: number;
  end: number;
  course: string | null;
  minutes: number;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  created_at: string;
};

/** What a request card in a chat points at (the message's `payload`). */
export type RequestRef = { type: 'break'; request: number } | { type: 'access'; request: number } | { type: 'skip'; request: number };

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

/** One field of a lesson's details: one key, or more merged into one ('floor' + 'room' → "-01.019").
 * No label: the app's own name for the first key (lib/details.ts). */
export type DetailField = { keys: string[]; label?: string; hidden?: boolean };
/** How a source's details break up and how you show them (api/roosters/details.py). split: how a location
 * breaks into parts ("NOO.-01.019" on "." → building, floor, room), or null (shown whole). */
export type DetailLayout = { v: number; split: { sep: string; parts: string[] } | null; fields: DetailField[] };
export type DetailExample = { course: string | null; kind: string; location: string | null; group: string | null };
/** GET /me/details: per origin (your school's classes, each calendar link) the layout to use (yours once saved,
 * else what we found), what we found, what schoolmates use (Untis only) and a few of your lessons to show it on. */
export type DetailOrigin = {
  origin: string;
  kind: 'untis' | 'ics';
  name: string;
  saved: boolean;
  layout: DetailLayout;
  detected: DetailLayout;
  suggested: { layout: DetailLayout; users: number } | null;
  examples: DetailExample[];
  syncing: boolean;
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
  /** request: a card for a break or access request or a skip question (full width in the chat; `user_id`: who asked) */
  kind: 'text' | 'event' | 'request';
  user_id: number | null;
  /** null when it was taken back (`deleted`) or removed by a moderator (`removed`) */
  body: string | null;
  payload: ChatEvent | RequestRef | null;
  /** kind request: the request as it is now (null: gone, e.g. one of you isn't friends any more) */
  request?: ({ type: 'break' } & BreakRequest) | ({ type: 'access' } & AccessRequest) | ({ type: 'skip' } & SkipRequest) | null;
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
  /** Open requests in this chat (a break or access request still waiting for an answer): the yellow 'Verzoek' tag */
  requests: number;
  last_read_id: number;
  last: ChatMessage | null;
  members: ChatPerson[];
  /** People in it, you included */
  count: number;
};

/** One chat with everyone in it (you too) and how far each of them read. */
/** A break you share with the friend of a one-to-one chat, this school week from now on. `asked`: there's a request
 * (from either of you) for it already, so the chat doesn't suggest it. */
export type SharedBreak = { day: string; start: number; end: number; asked: boolean };

export type ChatDetail = Omit<Chat, 'last'> & {
  /** One-to-one chats: the breaks you share this school week (for the "Pauze samen?" suggestion above the box) */
  breaks?: SharedBreak[];
  people: (ChatPerson & { last_read_id: number; me: boolean; friend: boolean })[];
  created_by: number;
};

/** "Meestal ga je met:": the friends you most often had a planned break with lately (`count`), else your pinned ones. */
export type UsualPartner = BreakPerson & { count: number };

export type ReportReason = 'spam' | 'mean' | 'unsafe' | 'other';
