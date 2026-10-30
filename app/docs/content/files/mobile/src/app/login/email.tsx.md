---
updated: 2026-10-30T09:29:00Z
---

Your e-mail address → `POST /auth/email/start` → the code screen (`mode` goes along). After 'Create an account'
(`mode=new`) it's step 1 of 9 and **Skip** makes a guest account; after 'I already have an account' (`mode=login`) it
asks 'Which email do you sign in with?' and has no progress bar and no skip. Opened from Today's steps (`from=steps`, or when already signed in as a guest) it has no progress bar and no skip, and the code screen upgrades the guest. There a guest can also choose **Ga verder met Google** ('of', `components/GoogleButton.tsx`), which upgrades the guest the same way (`lib/google.signInWithGoogle`).

## `EmailLogin`

With debug builds, a failed request shows exactly what went wrong and a link to the debug screen.
