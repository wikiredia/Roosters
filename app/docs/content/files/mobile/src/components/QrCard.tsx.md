---
updated: 2026-10-24T10:30:00Z
---

**QR codes** on Vriend toevoegen (`app/friends/add.tsx`), as two sections.

- **Jouw QR-code** (`QrCard`): your invite link as a QR code, drawn in the app (the `qrcode` package makes the
  matrix, `react-native-svg` draws it as one path): black on white, always (also in dark mode: scanners want dark on
  light), with the black-and-white logo (`Brand.AppIcon mono`) in the middle. Error correction is H (30 %), so the
  modules the logo covers don't matter. A phone's own camera opens the link too.
- **Scan een code** (`ScanCard`): a button with a camera icon opens a small square of the camera right in the page
  (`expo-camera` `CameraView`, QR only), the size of the QR code: not a separate app, not full screen. A friend's
  code makes you friends (`useAcceptInvite`) and goes to Vrienden. Asks for camera permission the first time
  (text in `app.json`).

## `QrCard`, `Qr`

The section, and the code itself (memoised per link).

## `ScanCard`

The scanner. One code at a time; a refused code (your own, expired) waits 2.5 s before the camera may try again.

## `codeFrom`

The invite code out of what was scanned: a link ending in `/i/<code>` (https or `roostersplus://`), or a bare
code. Anything else isn't ours.

## `useSide`

The size of both squares: 232 at most, narrower on small phones.
