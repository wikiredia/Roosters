---
updated: 2026-10-24T10:30:00Z
---

**Your link and your friend code**, two parts split by a line, each with **Kopieer** and **Deel** side by side (half
the width each). Deel opens the phone's share sheet (WhatsApp, Instagram, … are in there) with a short message. The
code is the same as the end of the link (`GET /api/v1/invites`); a friend types it under 'Heb je een code?' or
scans the QR code (`components/QrCard.tsx`). Used on Vriend toevoegen and the last onboarding step.

## `InviteCard`

The card.

## `Part`

One part: label, value (the code big and spaced out), Kopieer (shows 'Gekopieerd' for 2 s) and Deel.
