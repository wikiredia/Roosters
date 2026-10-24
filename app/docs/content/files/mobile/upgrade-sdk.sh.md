---
updated: 2026-10-24T19:03:00Z
---

Upgrades the app to a new Expo SDK the same way every time: `./upgrade-sdk.sh` (the newest stable SDK) or
`./upgrade-sdk.sh 59`. Starts from the committed lockfile (`npm ci`), runs `npx expo install expo@^N --fix` so
every Expo-managed package gets the version that SDK expects, and when the old lockfile can't satisfy the new
peer dependencies (npm `ERESOLVE`, as happened going to SDK 58) resolves `package-lock.json` again from scratch.
Then the same checks as CI (`.github/workflows/app-mobile.yml`): expo-doctor, `tsc`, the web export.

It only touches `package.json` and `package-lock.json` and refuses to start when they have uncommitted changes.
It can't read the SDK's breaking changes, fix type errors, or make the new development build: the steps it prints
at the end, and the recipe **Upgrading the Expo SDK**, cover those.
