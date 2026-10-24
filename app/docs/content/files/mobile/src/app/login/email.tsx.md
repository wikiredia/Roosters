---
updated: 2026-10-24T13:50:00Z
---

Step 1 of 8: your e-mail address → `POST /auth/email/start` → the code screen. **Skip** makes a guest account. Opened from Today's steps (`from=steps`, or when already signed in as a guest) it has no progress bar and no skip, and the code screen upgrades the guest. There a guest can also choose **Ga verder met Google** ('of', `components/GoogleButton.tsx`), which upgrades the guest the same way (`lib/google.signInWithGoogle`).

## `EmailLogin`

With debug builds, a failed request shows exactly what went wrong and a link to the debug screen.
