---
updated: 2026-10-24T13:20:00Z
---

Dependencies and scripts of the app (Expo SDK 57, React Native 0.86, Expo Router, TanStack Query with an AsyncStorage persister, Uniwind for Tailwind classes, Reanimated + Worklets and Gesture Handler for motion and drags, expo-notifications for push; adding or upgrading those native modules needs a new development build). `npm start` runs Expo; `npm run export:web` builds the web version (only used for testing and CI). Add packages with `npx expo install` so versions match the SDK.
