---
updated: 2026-10-30T09:29:00Z
---

**Sign in with Google** on the phone, with `react-native-nitro-google-signin` (Android Credential Manager, Google's
Sign-In SDK on iOS; listed by Expo's Google authentication guide, needs a development build). The phone gets an
**ID token** from Google and sends it to `POST /api/v1/auth/google`; the server checks it
(`api/roosters/providers.google`) and answers with our own tokens, exactly like Apple and the e-mail code. We don't
keep Google's session: right after the token we sign out of Google's SDK, so the next tap asks for an account again
(a shared phone).

Configuration (no secrets, they end up in the app): `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (the **web** OAuth client;
on both platforms this is the token's audience `aud`, so it must be in the server's `GOOGLE_CLIENT_IDS`) and
`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` (the iOS client; `app.config.ts` makes the URL scheme from it). Android needs no
id in the app: Google recognises it by package name + SHA-1. Setup in Google Cloud: guide **Running and operating**.

The UI is `components/GoogleButton.tsx` (the sign-in screen `app/login/index.tsx`, and the e-mail screen for guests).

## `WEB_CLIENT_ID`, `IOS_CLIENT_ID`

Read from `process.env.EXPO_PUBLIC_*` (inlined by Metro when it bundles; restart with `-c` after changing them).

## `googleSupport`, `GoogleSupport`

Whether the button can work here, worked out once: `web` (native only), `expoGo` (no native code there; checked with
`isRunningInExpoGo`, which unlike `Constants.executionEnvironment` doesn't also match dev-client builds),
`notConfigured` (no web client id, or on iOS no iOS client id), `notInBuild` (a development build from before the
module was added: `NitroModules.hasHybridObject`), else `ready`. The debug screen shows the reason in words.

## `Lib`, `load`

The library is `require`d on first use, never imported at the top: it talks to native code as soon as it loads,
which would crash Expo Go and old builds. `load` also calls `configure` once with the client ids.

## `idToken`

The explicit 'Sign in with Google' dialog (`presentExplicitSignIn`: all accounts on the phone, add one), after
`checkPlayServices` on Android. Returns null when the student closes it. On Android a `cancelled` right after picking
an account almost always means a missing SHA-1 in Google Cloud (the library can't tell it apart from closing).

## `GoogleError`, `GoogleProblem`

What went wrong on the phone's side: `playServices` (Android without up-to-date Google Play services),
`notSetUp` (`DEVELOPER_ERROR`: wrong SHA-1, package or client id; or `configure` refused), `failed` (anything else).
`detail` has Google's own code and message for debug builds.

## `signInWithGoogle`

The whole flow: Google → `freshenGuestToken` → `POST /auth/google` with the device → `afterSignIn`. The request goes
through the normal client **with** the access token when there is one, like the e-mail code: a **guest** is then
upgraded (`r_auth._guest_id`), keeping their school and timetable. Returns the tokens (with `account`: what happened
to the account), or null when cancelled; throws
`GoogleError`, or `ApiError`/`NetworkError` from our server (`provider_unavailable` when the server has no
`GOOGLE_CLIENT_IDS`, `provider_invalid` when the audience doesn't match).
