---
updated: 2026-10-30T09:29:00Z
---

Step 1 of 9 after 'Create an account' (with the e-mail screen; no progress after 'I already have an account'): enter the **6-digit code** (`components/ui/Inputs.CodeInput`). Six digits are checked right away (also after
a paste or the phone's 'code from mail' autofill). Resend after 60 s.

A guest's token is freshened and sent along, so the server **upgrades** the guest account instead of making
a new one (`lib/onboarding.freshenGuestToken`). **Skip** (no mail yet?) continues as a guest (not in `mode=login`); from Today's
steps the button says Later and goes back.

After the code: `lib/onboarding.routeAfterSignIn` with the mode and address. The same address as an existing account
signs you in to it, whichever button you came from; `login/found.tsx` says so.

## `CodeLogin`

As above. A wrong code clears the boxes; the error is translated by the server.

## `RESEND_AFTER`

Seconds before 'Send a new code' appears (60).
