---
title: Recipes: common changes
position: 100
updated: 2026-10-23T17:30:00Z
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

## Something in the console

A route in `api/roosters/admin.py` (with `record(...)` for changes) and a test in `tests/test_admin.py`, then
the UI in the Smart-Room repo's `console/web/js/roosters.js`.
