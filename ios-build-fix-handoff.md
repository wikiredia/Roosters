# Handoff: fix the iOS build failure (`ExpoModulesJSI xcframework` script)

You are running **locally on the user's Mac**, in the repo at
`/Users/redakadi/Documents/GitHub/Roosters`. Your job: get `npx expo run:ios` building again
for the Expo app in `app/mobile`.

Read `AGENTS.md` (repo root) and `app/mobile/AGENTS.md` first. Key rules from them:
- `app/mobile/ios/` is **generated** by Expo (Continuous Native Generation). Don't hand-edit
  files in it. Configure native behavior with `app.json` or config plugins. Regenerating
  `ios/` is fine.
- Changes under `app/` must update their docs (`app/docs/README.md` → "For agents"). A pure
  local environment fix (caches, `.xcode.env.local`, reinstalling deps) needs no doc change.

## Project facts
- Expo SDK `~58.0.19`, React Native `0.88.0`, react-native-screens `~4.30.0`, expo-router `~58.0.26`
- New Architecture on (`RCT_NEW_ARCH_ENABLED=1`)
- Xcode SDK: iPhoneSimulator 27.1, deployment target iOS 15.1, Apple Silicon (arm64 simulator)
- Build command: `cd app/mobile && npx expo run:ios`
- Full log: `app/mobile/.expo/xcodebuild.log`

## The failure
`npx expo run:ios` ends with:

```
› 2 error(s), and 0 warning(s)
CommandError: Failed to build iOS project. "xcodebuild" exited with error code 65.
❌  Script '[CP-User] Build ExpoModulesJSI xcframework' failed
❌  Command PhaseScriptExecution failed with a nonzero exit code
```

These are one failure, not two. The build script phase `[CP-User] Build ExpoModulesJSI xcframework`
(Pods target `ExpoModulesJSI`, from `expo-modules-core`) exited nonzero.

What's already known **not** to matter:
- The `CompileC … RNScreens …` lines compile normally.
- `note: Run script build phase '…' will be run during every build …` lines are harmless.
- `PruneExplicitPrecompiledModules` lines are routine.

**The root cause hasn't been found yet.** The script's own error output hasn't been read.

## Step 1: read the real error (do this first)
The script's output comes *after* its `PhaseScriptExecution` header in the log:

```sh
cd app/mobile
awk '/PhaseScriptExecution.*ExpoModulesJSI/{p=1} p{print; if(++n>150) exit}' .expo/xcodebuild.log
```

(Don't grep for `ExpoModulesJSI xcframework` alone. That only matches the harmless `note:` line.)

The last lines before `Command PhaseScriptExecution failed` give the reason. Also open the
script itself to see what it needs (Node, CMake, a specific tool, etc.):

```sh
grep -rn "ExpoModulesJSI" node_modules/expo-modules-core --include=*.podspec --include=*.rb --include=*.sh | head
```

## Step 2: likely fixes, by symptom

1. **`node: command not found` / `env: node: No such file or directory`**: Xcode script phases
   don't load your shell profile, so they can't find Node from nvm, fnm, volta or Homebrew. Fix:
   ```sh
   echo "export NODE_BINARY=$(command -v node)" > app/mobile/ios/.xcode.env.local
   ```
2. **A missing tool** (e.g. `cmake`, `ninja`): install it (`brew install cmake`), or make sure
   its path is visible to the script.
3. **Stale or mismatched native state after an upgrade** (missing headers, wrong paths, cached
   xcframework). Do a clean regenerate:
   ```sh
   cd app/mobile
   rm -rf ios node_modules ~/Library/Developer/Xcode/DerivedData/Roosters-*
   <install with the repo's package manager: check for bun.lock / package-lock.json / yarn.lock>
   npx expo prebuild --clean -p ios
   npx expo run:ios
   ```
   Note: `prebuild --clean` deletes `ios/.xcode.env.local`. Re-create it afterwards if fix 1 applies.
4. **Version mismatch between Expo packages**: run `npx expo install --check` and
   `npx expo-doctor`, then apply the suggested versions.
5. **A compile error inside the script** (from the new iOS 27.1 SDK or Xcode version): check
   for a newer `expo-modules-core` patch release or a known Expo issue for SDK 58 + Xcode
   with SDK 27.1, and upgrade within SDK 58 (`npx expo install expo-modules-core`).

## Done when
- `cd app/mobile && npx expo run:ios` builds and launches in the simulator.
- You report the root cause (quote the real error line) and the fix you applied.
- If you changed tracked files (e.g. `package.json`, lockfile, `app.json`), list them. Docs
  must be updated per `app/docs/README.md` for anything under `app/`. Don't commit unless the
  user asks.
