---
updated: 2026-10-30T15:40:00Z
---

**Push notifications** through Expo's push service (`https://exp.host/--/api/v2/push/send`, no account needed; an
access token only when "enhanced push security" is on in the Expo dashboard: `config.EXPO_ACCESS_TOKEN`). Always
from a job in the worker: a slow or unreachable push service never makes a request wait.

How a push comes about:

- **Notifications** (break requests and what became of them, timetable changes): `notifications.enqueue` stores the
  in-app notification and queues `push` for that user. `_job_push` sends what hasn't been pushed yet
  (`notifications.push_sent_at`); a job after it finds nothing left.
- **Chat**: `chat.send` queues `push_chat` for the message; `_job_push_chat` sends it to everyone with the bell on.

Who gets it: the phones of the user's signed-in sessions (`sessions.push_token`, migration `0013_push.sql`), only
for the categories turned on in Meldingen, never in quiet hours (that push is dropped; the notification stays in the
app). The **texts are written here**, in `users.locale`: the app isn't running when they arrive. The app side is
`mobile/src/lib/push.ts` (channels, Ja / Nee buttons, what a tap opens via `data.url`).

`PUSH_MODE=console` only logs (the tests; a server that must not send).

## `SEND_URL`, `RECEIPTS_URL`, `BATCH`, `RECEIPTS_AFTER`

Expo's endpoints, at most 100 messages per request, receipts asked 15 minutes later (Expo's advice; they're kept
24 hours).

## `STALE`, `MAX_BODY`, `TOKEN`

Not pushed within 6 hours (worker down): not news any more, only in the app. Bodies are cut at 180 characters.
`TOKEN`: `ExponentPushToken[…]` / `ExpoPushToken[…]`.

## `CATEGORY`, `CATEGORIES`, `DEFAULTS`

Notification kind → Meldingen category (`requests`, `changes`; chat has its own job). The category is also the
Android channel id the app creates. `DEFAULTS`: everything on, no quiet hours (no `push_settings` row).

## `valid_token`, `quiet`

Pure. `quiet`: is this minute in the quiet hours (from > until runs past midnight; equal = off)?

## `skip_text`, `_duration_en`

A skip question ("Volg je DevOps? / Kayra vraagt of je DevOps volgt morgen om 10:00. Zo niet, dan heb je 2 uren samen
pauze.") or its answer, which never names the course (the asker may only see when the friend is free).

## `break_text`, `access_text`, `change_text`, `chat_text`

Pure: title and body in Dutch or English. "Pauze samen? / Lotte wil pauze met jou om 12:30. Kan jij?",
"Roosterwijziging morgen / Databases verplaatst: 10:30 → 13:00, B204 → C102.", several changes of one day as one
short line, a group message as "Kayra: …" under the group's name. Tested in `tests/test_push.py`.

## `build`

One user's new notifications → messages without `to`. Break requests and counter-proposals get `categoryId
break_request` (Ja / Nee / Ander uur on the phone) and `data.request`; the changes of one day become one push with
`collapseId changes-<day>`, so a later one replaces it on the phone. Requests (break_* and access_*) have
`data {kind, request, chat, url: "/chat/<chat>"}`: a tap opens the chat with the card (`/today` for older
notifications without a chat). Access requests have no day.

## `register`, `unregister`, `forget`, `tokens_of`, `has_token`

The token on its session (taken off any other session first); off for this session; off wherever it is (Expo says
DeviceNotRegistered); the tokens of someone's live sessions; whether this session has one (Meldingen shows it).

## `settings`, `save_settings`

Meldingen. `save_settings` takes only what changed; quiet hours both or neither (else 400 `invalid`).

## `deliver`

Hands messages to Expo, 100 per request. A ticket with DeviceNotRegistered forgets that token; the others go into a
`push_receipts` job for 15 minutes later. Expo unreachable, 429 or 5xx: `jobs.Retry` (the job tries again); another
4xx: the job fails with Expo's answer in `jobs.last_error`.

## `_job_push`

Marks the user's unpushed notifications in a transaction first (`FOR UPDATE`: two workers never send the same), then
filters (category on, not stale, not in quiet hours, a phone to send to) and sends. If Expo can't be reached the marks
are taken off again, so the retry still has them.

## `_job_push_chat`

One message, to everyone in the chat with the bell on: not the writer, not who blocked the writer, a one-to-one chat
only while they're still friends (like `chat._visible`), chat on in Meldingen, outside quiet hours. A message taken
back before the job runs isn't sent. `threadId chat-<id>` stacks a chat's pushes on iOS.

## `_job_receipts`

Asks Expo how delivery went; DeviceNotRegistered forgets the token, other errors are logged.

## `send_test`

A push to your own phones right away (`POST /api/v1/debug/push`, the debug screen).

## `_DAYS`, `_day`, `_when`, `_short`, `_moved`, `_post`, `_mask`, `_user`, `_minute`

Helpers: "vandaag / morgen / di 28/10", "om 12:30", cutting a body, what moved about a lesson, the HTTP call (plain
`urllib`: no extra dependency), a token shortened for the log, the user with the school's timezone, the minute of
the day.
