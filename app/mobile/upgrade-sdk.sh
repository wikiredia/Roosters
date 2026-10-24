#!/usr/bin/env bash
# Upgrade the app to a new Expo SDK, the same way every time (docs: guide "Recipes" → "Upgrading the Expo SDK").
#
#   ./upgrade-sdk.sh          the newest stable SDK (npm's "latest" tag of expo)
#   ./upgrade-sdk.sh 59       a given major version
#
# Moves expo and every Expo-managed package to the versions that SDK expects, then runs the same checks as CI
# (expo-doctor, tsc, the web export). It changes package.json and package-lock.json only; it never commits.
# What it can't do: read the SDK's breaking changes for you (https://expo.dev/changelog), fix type errors, or make
# the new development build that native changes need.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

current="$(node -p 'require("./node_modules/expo/package.json").version' 2>/dev/null || echo none)"
target="${1:-$(npm view expo@latest version | cut -d. -f1)}"
step "Expo SDK ${current%%.*} -> $target (installed: expo $current)"

# Expo's minimum Node goes up with the SDK (SDK 58: 22.13+); expo-doctor says so too, but a clear stop is kinder
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 22 ]; then
  echo "Node $(node -v) is too old for current Expo SDKs: install Node 22 LTS or newer." >&2
  exit 1
fi

if ! git diff --quiet -- package.json package-lock.json; then
  echo "package.json / package-lock.json have uncommitted changes: commit or stash them first." >&2
  exit 1
fi

step "npm ci (start from the committed lockfile)"
npm ci --no-audit --no-fund

step "npx expo install expo@^$target --fix"
if ! npx expo install "expo@^$target" --fix; then
  # A new SDK often changes optional peer dependencies that the old lockfile can't satisfy (ERESOLVE).
  # package.json already has the new versions at this point: resolve them again from scratch.
  step "the old lockfile conflicts with the new SDK: resolving package-lock.json again"
  rm -rf node_modules package-lock.json
  npm install --no-audit --no-fund
  npx expo install --fix
fi

# Keep the house style: ~ ranges for Expo packages, like `npx expo install` writes them
npm pkg set "dependencies.expo=~$(node -p 'require("./node_modules/expo/package.json").version')"
npm install --no-audit --no-fund

step "checks (the same as CI: .github/workflows/app-mobile.yml)"
npx expo-doctor
npx tsc --noEmit
npx expo export --platform web --output-dir "$(mktemp -d)" >/dev/null

step "done: expo $(node -p 'require("./node_modules/expo/package.json").version')"
cat <<'EOF'
Next:
  1. Read the SDK's changelog (breaking changes, deprecations) and fix what applies; tsc caught the type-level ones.
  2. Update the docs: files/mobile/package.json.md (SDK and React Native versions), and whatever you changed.
  3. Make a new development build (npx expo run:ios|android, or eas build): old builds can't run the new SDK.
  4. Try the app on a phone: sign-in (Apple, Google), push, camera, the timetable gestures.
  5. Commit package.json + package-lock.json + your fixes together.
EOF
