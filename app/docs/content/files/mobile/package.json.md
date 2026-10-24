---
updated: 2026-10-24T19:03:00Z
---

Dependencies and scripts of the app (Expo SDK 58, React Native 0.88, React 19.3, Expo Router, TanStack Query with an AsyncStorage persister, Uniwind for Tailwind classes, Reanimated + Worklets and Gesture Handler for motion and drags, expo-notifications for push, react-native-nitro-google-signin + react-native-nitro-modules for Sign in with Google; adding or upgrading those native modules needs a new development build). `npm start` runs Expo; `npm run export:web` builds the web version (only used for testing and CI). Add packages with `npx expo install` so versions match the SDK. Needs Node 22.13+ (SDK 58). Upgrade the SDK with `./upgrade-sdk.sh`, never by editing versions here (recipe **Upgrading the Expo SDK**). Gesture Handler 3 marks the `Gesture.*` builder API the timetable and sheets use as deprecated: it still works, moving to its hook API (`usePanGesture`, …) is a later job.
