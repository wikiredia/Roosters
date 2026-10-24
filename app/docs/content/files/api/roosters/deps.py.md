---
updated: 2026-10-24T18:00:00Z
---

**Who is asking** and small helpers every router uses. Read this before writing a route.

- `Depends(auth)`: any signed-in user, guests included.
- `Depends(verified)`: signed-in **and not a guest**. All social routes (`r_friends.py`) use it.
- `optional_auth(request)`: for sign-in routes that behave differently when a guest is already signed
  in (`r_auth._guest_id`).

The session is checked in the database on **every request**, so 'log out everywhere', account deletion
and turning an account off in the console take effect at once (no waiting for the 15-minute access
token to expire).

## `Ctx`

The request context: the user row (joined with the school's `tz`) and the session id. `ctx.uid` is the user id.

## `auth`

Decodes the bearer access token (`tokens.decode_access`), then loads the user through the session. The session must exist, not be revoked or expired, and the user must not be disabled. Sets `request.state.lang` from the user's locale so errors come back in their language. Raises 401 `auth_required`/`auth_expired`. Tells `tokens.saw` which refresh generation the phone uses.

## `etag_json`

JSON with an ETag (a hash of the body). When the app sends the same tag in `X-If-None-Match`, it gets an empty
200 with `X-Not-Modified: 1`: a few bytes instead of the whole Today screen on slow school wifi. Used for Today,
schedules, schools and classes.

**Never a real 304, always `no-store`.** iOS answers a 304 with its *own* cached copy of that URL, and that copy
could be an old 401: after every token refresh the app saw `auth_expired` again while this server logged 304. So
the phone's HTTP cache is kept out entirely; the app keeps its own copies (`mobile/src/lib/api.ts`). A plain
`If-None-Match` (a cache adding one by itself) gets the full answer.

## `json_error`

Builds the error response (`{code, message, ...extra}`); `retry_after` also becomes a `Retry-After` header.

## `lang`

The language for messages: the signed-in user's locale, else `Accept-Language`, else Dutch (`i18n.lang_of`).

## `optional_auth`

Like `auth`, but returns None instead of raising when there is no valid token.

## `parse_day`

`YYYY-MM-DD` query parameter to a date, or the default; anything else gives 400 `day_invalid`.

## `verified`

`auth` plus a refusal for guests: 403 `verify_required`. The app shows 'confirm your e-mail' (`mobile/src/components/VerifyFirst.tsx`).
