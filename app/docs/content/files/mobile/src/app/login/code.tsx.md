---
updated: 2026-10-24T13:30:00Z
---

Step 1 of 8 (with the e-mail screen): enter the **6-digit code** (`components/ui/Inputs.CodeInput`). Six digits are checked right away (also after
a paste or the phone's 'code from mail' autofill). Resend after 60 s.

A guest's token is freshened and sent along, so the server **upgrades** the guest account instead of making
a new one (`lib/onboarding.freshenGuestToken`). **Skip** (no mail yet?) continues as a guest; from Today's
steps the button says Later and goes back.

## `CodeLogin`

As above. A wrong code clears the boxes; the error is translated by the server.

## `RESEND_AFTER`

Seconds before 'Send a new code' appears (60).
