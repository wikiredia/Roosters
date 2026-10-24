---
title: Recipes: common changes
position: 100
updated: 2026-10-24T19:03:00Z
---

## A new API endpoint

1. Pick the router (`r_me` for your own data, `r_friends` for social, `r_schools` for public lists).
2. `@router.get("/path")` with `ctx: Ctx = Depends(auth)`, or `Depends(verified)` for anything social.
3. Errors: `raise ApiError(status, "code")`, and add the code to `i18n.ERRORS` (Dutch + English).
4. Reads the app polls: `etag_json(request, data)`.
5. A test in `api/tests/`, the hook in `mobile/src/api/hooks.ts`, the type in `types.ts`, the docs.

## A new setting

`config.py` (read from the environment) → `.env.example` (with a comment) → docs for both.

## A new background job

`@jobs.handler("kind")` in the module that owns the work → make sure `worker.py` imports it →
`jobs.enqueue("kind", payload, dedupe=...)`. Raise `jobs.Retry` for 'try again later'.

## A new screen

A file in `mobile/src/app/` (it's a route), built from `Screen` and the `components/ui` parts; texts as keys
in `i18n/nl.ts` and `en.ts`; data through a hook.

## A new onboarding step

Add the screen under `app/onboarding/`, link it from the previous step, give it `navRight` with **Skip**
(`useFinishOnboarding` or the next step), and add a matching item to `components/SetupSteps.tsx` so
skipping it shows on Today.

## Upgrading the Expo SDK

Once per SDK release (roughly three a year). From `mobile/`:

1. Read the SDK's changelog (`https://expo.dev/changelog`): breaking changes, the minimum Node version, what
   Expo Go supports. Search `src/` for anything it removes or renames.
2. `./upgrade-sdk.sh` (or `./upgrade-sdk.sh <major>`): moves every Expo package to the SDK's versions and runs the
   CI checks (`files/mobile/upgrade-sdk.sh`).
3. Fix what `tsc` reports. Going to SDK 58 that was React Native's stricter types (refs as
   `useRef<ComponentRef<typeof View>>`, not `useRef<View>`) and Expo Router's own tab bar props
   (`emitter` + `navigateToTab` instead of `navigation`).
4. Docs: the versions in `files/mobile/package.json.md`, plus a doc for every file you changed.
5. A **new development build** (`npx expo run:ios|android` or `eas build`), then try sign-in (Apple, Google),
   push, the camera and the timetable gestures on a phone. Expo Go only runs the newest SDK, so it needs updating too.
6. Store builds: `eas build` picks up the new SDK by itself; raise `version` in `app.json` for the next release.

## Something in the console

A route in `api/roosters/admin.py` (with `record(...)` for changes) and a test in `tests/test_admin.py`, then
the UI in the Smart-Room repo's `console/web/js/roosters.js`.
