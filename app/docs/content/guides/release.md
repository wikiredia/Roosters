---
title: Releasing to TestFlight and Play
position: 75
updated: 2026-10-30T15:00:00Z
---

From "it runs in Expo Go on my laptop" to testers installing Roosters+ from **TestFlight** (iOS) and **Google Play
internal testing** (Android). Do the parts in this order: a store build needs a real HTTPS address for the API before
anything else, and the Google client ids need the signing keys that the first builds create.

```
 1. Server on HTTPS (Caddy)  ──> https://api.<your-domain>   baked into every store build; + website, old server
 2. Expo account + EAS       ──> eas.json, environment variables, the project id (push)
 3. Apple                    ──> App Store Connect app, first build, TestFlight
 4. Xcode (optional)         ──> run and debug the native iOS project on your Mac
 5. Google                   ──> Play Console, Google Cloud (sign-in), Firebase (push), Play upload
```

Names used below: bundle id / package **`be.roostersplus.app`** (fixed in `mobile/app.json`; it can't change after
the first store upload), and **`api.roostersplus.be`** as the API's address: replace it with your own domain
everywhere.

## Why HTTPS comes first

A development build finds the API by itself (the computer running `expo start`, `mobile/src/lib/server.ts`). A
**store build has no Metro**: it uses `EXPO_PUBLIC_API_URL`, baked in at build time, and without it it tries
`http://localhost:8000` and nothing works. iOS also refuses plain `http://` to the internet in release builds
(App Transport Security), and the debug screen to change the address only exists in development builds (or with
`EXPO_PUBLIC_DEBUG=1`), and for the owner's account once it's signed in (`DEBUG_EMAIL`). So: a domain name, HTTPS, then build.

## 1. Caddy: HTTPS for the API, the website and the old server

Caddy is a web server that gets and renews Let's Encrypt certificates by itself. On the server it owns ports 80
and 443 and sends every address to the right place (`infra/Caddyfile`, started by `docker-compose.prod.yml`):

```
                  ┌─ roostersplus.be ───────────────> site:8080     Apache, the website (site/)
                  ├─ www.roostersplus.be ───────────> 301 to roostersplus.be
 internet ─:443─> caddy ─ api.roostersplus.be ─ /api/v1/* ──> api:8000     Roosters+ (this API)
   (:80 too)      │                             └ the rest ──> roosters-v1  the old Roosters (server/): web app + /api/*
                  ├─ temp.roostersplus.be ──────────> roosters-v1   the old Roosters, whole
                  └─ 94.226.242.154 (the old address) ─> /sw.js: kills the old web app's service worker
                                                         /api/*: 308 to temp.roostersplus.be (calendar feeds)
                                                         the rest: 302 to roostersplus.be

 admin :8090, docs :8095, api :8000   127.0.0.1 only, never in Caddy
```

The two APIs don't collide: Roosters+ only uses `/api/v1/...`, the old server only `/api/...` without `v1`. The
old server runs in its own compose project (`server/`); Caddy reaches its Apache over the shared Docker network
`roosters-edge` under the name `roosters-v1` (`server/docker-compose.caddy.yml`). When it's down, only its addresses
give a 502.

**The old server's own HTTPS goes away.** It used to own 80/443 itself, with a Let's Encrypt **IP** certificate from
its `certbot` container (or a self-signed one). Behind Caddy that's switched off with `TLS_MODE=proxy`: its Apache
then speaks plain HTTP inside Docker only, certbot stops, and the old API still treats requests as HTTPS (secure
cookies, push). Steps in `server/README.md` → "Achter Caddy". Old links to `https://<ip>` keep working through Caddy's
last block: it gets a short-lived Let's Encrypt **IP** certificate itself (profile `shortlived`, ~6 days, renewed
automatically), sends calendar subscriptions (`/api/feed/…`) on to `temp.roostersplus.be`, and everything else to
`roostersplus.be` (which links to `temp.`). An installed old web app would keep showing its cached copy, so `/sw.js`
there is a service worker that wipes the cache, unregisters itself and sends the window to `roostersplus.be`; the
browser picks it up on the next visit. On `temp.roostersplus.be` people sign in and allow notifications again (a new
origin). The public IP is written in the `Caddyfile`: change it there when it changes.

**DNS and ports.**

1. At the DNS provider of `roostersplus.be` add **A records** → the server's public IPv4 for `@` (the bare domain),
   `www`, `api` and `temp` (and **AAAA** records if the server has IPv6). Check: `dig +short api.roostersplus.be`.
2. On the router (home server) or the firewall (Hetzner): forward/open **TCP 80, TCP 443 and UDP 443** to the
   server. Port 80 is needed for the certificate challenge and the redirect to HTTPS.
3. Close everything else from outside, **especially 8000/8010 and 8081**: when the API is reachable without Caddy,
   a client can send its own `X-Forwarded-For` and dodge the per-IP rate limits (`api/roosters/r_auth.py`,
   `_client_ip`). Caddy always replaces that header with the real address. Check from outside (phone on 4G):
   `http://<ip>:8000` must not answer.

**`app/.env` on the server** (every secret new: `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`):

```bash
COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml   # plain `docker compose` = production
ENV=prod                               # no /api/docs, no debug endpoints, no login codes in the log
PUBLIC_URL=https://api.roostersplus.be
CORS_ORIGINS=                          # the native app needs none
MAIL_MODE=smtp
MAIL_FROM=Roosters+ <no-reply@roostersplus.be>
SMTP_HOST=smtp.your-provider.com       # Brevo, Postmark, Mailgun, Amazon SES, ...
SMTP_PORT=587
SMTP_STARTTLS=1
SMTP_USER=...
SMTP_PASSWORD=...
APPLE_CLIENT_IDS=be.roostersplus.app   # Sign in with Apple: the bundle id
GOOGLE_CLIENT_IDS=                     # the Google WEB client id, part 5
```

`docker-compose.prod.yml` drops `--reload`, keeps Mailpit out (profile `dev`), uses the SMTP settings above, puts
the API on loopback only (`ports: !override` needs Docker Compose 2.24.4 or newer: `docker compose version`), and
adds `site` and `caddy`.

**No SMTP provider yet?** Keep Mailpit for now: `COMPOSE_PROFILES=dev`, `SMTP_HOST=mailpit`, `SMTP_PORT=1025`,
`SMTP_STARTTLS=0` (no `SMTP_USER`/`SMTP_PASSWORD`). Nothing reaches real inboxes: you read the codes yourself at
http://localhost:8025 after `ssh -L 8025:127.0.0.1:8025 <server>` (the prod file publishes it on loopback only, so
never open 8025 on the router). Fine for you and a few testers; Apple/Google sign-in and guest mode work as normal.
Before TestFlight/Play testers who sign in by e-mail, switch to a real provider and remove `dev` from the profiles.

Login codes are the main way in, so the mail must arrive: at the mail provider, verify the domain and add the
**SPF, DKIM and DMARC** records it gives you, then test with `docker compose exec api python -m roosters.cli
test-mail you@example.com`.

**Start and check.**

```bash
docker network create roosters-edge          # once: the network Caddy shares with the old server
cd server && docker compose --profile letsencrypt rm -sf certbot && docker compose up -d --build   # old server, TLS_MODE=proxy first
cd ../app && docker compose up -d --build --remove-orphans                                        # with COMPOSE_FILE above
docker compose logs -f caddy                                           # "certificate obtained successfully" ×4
curl https://api.roostersplus.be/api/v1/health                         # from another machine: Roosters+
curl https://api.roostersplus.be/api/health                            # the old server's API
curl -I https://roostersplus.be https://temp.roostersplus.be
```

Without `COMPOSE_FILE` in `.env`, add `-f docker-compose.yml -f docker-compose.prod.yml` to every command.
**Every update after that: `./server-restart.sh`** (repo root). With `COMPOSE_FILE=…docker-compose.prod.yml` in
`app/.env` it runs in production mode: `git pull`, creates `roosters-edge` if missing, rebuilds the old server when
`server/.env` has `TLS_MODE=proxy`, brings up the prod stack, reloads the Caddyfile, waits for the API, and starts
Expo against `PUBLIC_URL` (the API port is loopback-only now, so the phone goes through Caddy too). The laptop can be
this server: same script, same repo. Testing from a phone on the **same home wifi** needs the router to support
"NAT loopback" (hairpinning) for `api.roostersplus.be`; if it doesn't, test over 4G. Without `COMPOSE_FILE` it's the laptop setup (and its `--remove-orphans` would stop Caddy), so set
that line before the first run on the server.
Certificates renew by themselves as long as port 80/443 stay open; they live in the `caddy_data` volume (keep it:
Let's Encrypt has rate limits). A changed `Caddyfile`: `docker compose exec caddy caddy reload --config
/etc/caddy/Caddyfile`. A changed website (`site/`): nothing to do, Apache serves the mounted folder.

**The website** (`site/`, static HTML, Dutch): home with the store buttons, contact (= the **support URL** for
Apple), privacy policy (the **privacy policy URL** for both stores and Google sign-in branding), terms, and
**account deletion** (Play's *Data safety → delete account URL*). Before submitting, fill in: the person or company
responsible in `privacy.html`, a working `support@roostersplus.be` mailbox (or change the address in every page),
and the App Store link in `index.html` once the app has its Apple ID. Set `EXPO_PUBLIC_LEGAL_URL` to
`https://roostersplus.be/privacy.html` (part 2).

## 2. Expo account and EAS

EAS builds and signs the app in Expo's cloud: **no Mac needed** for iOS builds. The free plan is enough to start
(builds wait in a queue).

1. Make an account on [expo.dev](https://expo.dev) (an organisation is handy if more people will build).
2. Link the project, from `app/mobile`:

   ```bash
   npm install
   npx eas-cli@latest login
   npx eas-cli@latest init          # adds extra.eas.projectId (and owner) to app.json: commit that
   ```

   The project id is also what push needs (`mobile/src/lib/push.ts`).
3. Create `app/mobile/eas.json` (`npx eas-cli@latest build:configure` makes a default one; this is what we need):

   ```json
   {
     "cli": { "version": ">= 16.0.0", "appVersionSource": "remote" },
     "build": {
       "preview": {
         "distribution": "internal",
         "environment": "preview",
         "android": { "buildType": "apk" }
       },
       "production": {
         "environment": "production",
         "autoIncrement": true
       }
     },
     "submit": {
       "production": {
         "ios": { "ascAppId": "<Apple ID of the app, part 3>" },
         "android": { "track": "internal", "releaseStatus": "draft" }
       }
     }
   }
   ```

   - **preview**: an APK you install on Android phones straight from a link (fastest Android testing). On iOS,
     internal distribution needs every iPhone registered (`eas device:create`): use TestFlight instead.
   - **production**: what goes to TestFlight and Play. `appVersionSource: remote` + `autoIncrement` let EAS count
     the build numbers; `version` in `app.json` (0.1.0) is what testers see. Raise it for each new version.
   - `releaseStatus: draft`: Play refuses anything else while the app has never been published. Remove it once the
     first release is out.
4. **Environment variables** for the builds. `.env` files are not used by EAS builds (`.env*.local` isn't even
   uploaded), so put them in EAS:

   ```bash
   npx eas-cli@latest env:create --name EXPO_PUBLIC_API_URL --value https://api.roostersplus.be \
     --environment preview --environment production --visibility plaintext
   npx eas-cli@latest env:create --name EXPO_PUBLIC_DEBUG --value 1 --environment preview --visibility plaintext
   # after part 5:
   npx eas-cli@latest env:create --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value <web client id> \
     --environment preview --environment production --visibility plaintext
   npx eas-cli@latest env:create --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID --value <ios client id> \
     --environment preview --environment production --visibility plaintext
   ```

   `EXPO_PUBLIC_*` values end up inside the app, so they're never secret. `EXPO_PUBLIC_DEBUG=1` keeps the
   **Server & debug** screen in tester builds; leave it out of production once the app is public. The owner's account
(`DEBUG_EMAIL` on the API) has the debug screens and endpoints in every build anyway, production too. Optionally
   `EXPO_PUBLIC_LEGAL_URL` (privacy page shown in the app). `npx eas-cli@latest env:list` shows what's set; a change
   needs a new build.

## 3. Apple: from developer account to TestFlight

You have the **Apple Developer Program** (€99/year). If it's an *individual* membership, your own name is shown as
the seller in the App Store; an organisation membership (needs a D-U-N-S number) shows the company.

**The app in App Store Connect.**

1. [App Store Connect](https://appstoreconnect.apple.com) → **Apps → + → New App**: platform iOS, name
   **Roosters+** (must be unique in the App Store: have a backup such as "Roosters+ AP"), primary language Dutch,
   bundle id `be.roostersplus.app` (if it isn't in the list yet, register it first: [Certificates, Identifiers &
   Profiles](https://developer.apple.com/account/resources/identifiers/list) → **+** → App IDs → App, explicit
   bundle id, tick **Sign in with Apple** and **Push Notifications**; or let the first EAS build register it and
   come back), SKU `roostersplus`, full access.
2. **App Information → General Information → Apple ID** (a number like `6741234567`): put it in `eas.json` as
   `ascAppId`.
3. **Users and Access → Integrations → App Store Connect API → Team Keys → +** (role *App Manager*), or let EAS do
   it: `npx eas-cli@latest credentials -p ios` → production → *App Store Connect: Manage your API Key* → set up for
   EAS Submit. With a key, submitting never asks for your Apple ID password or 2FA again.

**First build.** From `app/mobile`:

```bash
npx eas-cli@latest build -p ios --profile production
```

The first time it asks to log in with your Apple ID and lets EAS create everything: the **distribution
certificate**, the **provisioning profile**, and (say yes) the **push key** (APNs). It also switches on the
capabilities the app uses (Sign in with Apple from `ios.usesAppleSignIn`, push from `expo-notifications`). The
build takes 15–30 minutes; the link in the terminal shows its progress and logs.

**To TestFlight.**

```bash
npx eas-cli@latest submit -p ios --profile production          # pick the build you just made
# next time, build and submit in one go:
npx eas-cli@latest build -p ios --profile production --auto-submit
```

Apple processes it for 10–15 minutes and mails you. Export compliance is answered already
(`ITSAppUsesNonExemptEncryption = false`, from `ios.config.usesNonExemptEncryption` in `app.json`).

**Testers.** App Store Connect → your app → **TestFlight**:

- **Internal testing** (up to 100 people, no review, available minutes after processing): testers must be users of
  your App Store Connect team first (**Users and Access → +**, any role). Then **Internal Testing → +** a group,
  add them, add the build. They get an e-mail, install the **TestFlight** app and tap *Accept*/*Install*.
- **External testing** (up to 10,000, anyone with an e-mail address or a **public link**): fill in **Test
  Information** (what to test, feedback e-mail, contact, privacy policy URL) and the **sign-in info** for the
  reviewer. There is no password login, so write: *"No account needed: tap 'Verder zonder aan te melden' /
  'Continue without signing in' (guest). Sign in with Apple also works."* Make a group, add the build, **Submit for
  review** (Beta App Review, usually within a day, again for each new version number, not for each build).

TestFlight builds expire after 90 days. Things Apple's (beta) review checks that Roosters+ already has: Sign in with
Apple next to Google (guideline 4.8) and deleting your account inside the app (5.1.1).

## 4. Xcode (optional: native debugging on your Mac)

You don't need Xcode for TestFlight (part 3 builds in the cloud). Use it to run on your own iPhone, debug native
crashes, or archive by hand. Needs a Mac.

1. Install **Xcode** from the Mac App Store, open it once, accept the license, and let it install the iOS
   platform. Then in a terminal: `xcode-select --install` (command line tools), Node 22.13+, and
   [CocoaPods](https://cocoapods.org) (`brew install cocoapods`).
2. **Xcode → Settings → Accounts → +**: your Apple ID, so Xcode knows your team.
3. Generate the native project (it is **generated, never edited and never committed**: `ios/` is in
   `mobile/.gitignore`; native settings live in `app.json`, `app.config.ts` and config plugins):

   ```bash
   cd app/mobile
   npm install                       # app/mobile/.env: the EXPO_PUBLIC_GOOGLE_* ids, if you have them (app.config.ts reads them now)
   npx expo prebuild -p ios --clean  # writes ios/ and installs the pods
   xed ios                           # opens the .xcworkspace in Xcode (always the workspace, not the .xcodeproj)
   ```

4. In Xcode: the project → the app target → **Signing & Capabilities** → *Automatically manage signing*,
   pick your **Team**. Sign in with Apple and Push Notifications should already be listed.
5. Your iPhone: plug it in (or same wifi after the first time), trust the Mac, and switch on **Settings → Privacy
   & Security → Developer Mode** (the phone restarts). Choose it as run destination and press **Run**. Or without
   the Xcode UI: `npx expo run:ios --device`.
6. A Debug build loads the JavaScript from Metro: keep `npx expo start` running on the Mac, same wifi.
7. **Archive by hand** (instead of EAS): scheme set to *Any iOS Device*, **Product → Archive → Distribute App →
   App Store Connect → Upload**. Raise the build number first (target → General → Build), and remember that
   `EXPO_PUBLIC_API_URL` must be set in the shell/`.env` when the release bundle is made.

After changing `app.json`, `app.config.ts` or adding a package with native code, run `npx expo prebuild -p ios
--clean` again: hand edits in `ios/` are lost by design.

## 5. Google: from zero to Play internal testing

Four Google things, best all under **one Google account** you'll keep (a shared/business one, with 2-step
verification on), and **one Google Cloud project**:

| What | Where | For |
| --- | --- | --- |
| Play developer account + app | [Play Console](https://play.google.com/console) | publishing, testers |
| OAuth clients | [Google Cloud Console](https://console.cloud.google.com) | Sign in with Google |
| Firebase project | [Firebase Console](https://console.firebase.google.com) | push on Android (FCM) |
| Service account | Google Cloud → IAM | `eas submit` uploading to Play |

### 5a. Play Console account and the app

1. [play.google.com/console/signup](https://play.google.com/console/signup): one-time US$25.
   - **Personal** account: identity check (ID document), phone number, and proof you have an Android phone (the
     Play Console app). New personal accounts must run a **closed test with at least 12 testers for 14 days in a
     row** before they may publish to production. Internal testing is allowed right away.
   - **Organisation** account: needs a free D-U-N-S number for the company (can take days to weeks); no 12-tester
     rule.
2. **Create app**: name Roosters+, default language Dutch (nl-NL), App, Free, accept the declarations.

### 5b. Google Cloud project and Sign in with Google

1. Google Cloud Console → project picker → **New project** "Roosters+".
2. **Google Auth Platform → Branding**: app name Roosters+, support e-mail, logo (optional), home page and privacy
   policy URLs, authorised domain `roostersplus.be`. **Audience**: *External*; while it says *Testing* only the
   test users you add there can sign in, so **Publish app** before real testers use it (with only `openid`,
   `email`, `profile` no Google verification is needed).
3. **Clients → Create client**:
   - **Web application**, name "Roosters+ server", no URIs. Its id goes in `GOOGLE_CLIENT_IDS` (server `.env`) and
     `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (EAS env, part 2): it's the audience of every ID token (guide **Auth,
     sessions and guests**).
   - **iOS**, bundle id `be.roostersplus.app`. Its id goes in `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`;
     `mobile/app.config.ts` turns it into the URL scheme.
   - **Android**, package `be.roostersplus.app` + a **SHA-1**, **one client per signing key**. Google knows the app
     by package + SHA-1, so a build signed with a key it doesn't know gets a silent cancel after picking an account:
     - the **EAS upload key** (preview APKs, and what you upload to Play): after the first Android build,
       `npx eas-cli@latest credentials -p android` → production → shows *SHA1 Fingerprint*;
     - the **Play app signing key** (everything installed *from Play*, Google re-signs it): after the first upload,
       Play Console → your app → **App integrity** (under *Setup*) → **App signing** → *App signing key
       certificate* → SHA-1;
     - the local debug key, only for `npx expo run:android`
       (`keytool -list -v -keystore android/app/debug.keystore -alias androiddebugkey -storepass android`).
4. Set the two `EXPO_PUBLIC_GOOGLE_*` EAS variables (part 2) and `GOOGLE_CLIENT_IDS` on the server
   (`docker compose ... up -d api worker`), then **build again**: the ids are baked in.

### 5c. Firebase for Android push

Expo sends the pushes (`api/roosters/push.py`), but an Android phone can only get a push token when the app is
registered with Firebase Cloud Messaging.

1. Firebase Console → **Add project** → choose the **existing** Google Cloud project "Roosters+" (keeps it all in
   one place). Analytics not needed.
2. **Add app → Android**, package `be.roostersplus.app` → download **`google-services.json`**. It only holds public
   identifiers: put it in `app/mobile/` and point `app.json` at it (`"android": { "googleServicesFile":
   "./google-services.json" }`). That's a change to the app's config, so it goes through the repo with its docs
   (`files/mobile/app.json`). It doesn't change Sign in with Google, which keeps using the client ids from 5b.
3. **Project settings → Service accounts → Generate new private key**: a JSON file that **is secret**. Never put it
   in the repo. Upload it to EAS: `npx eas-cli@latest credentials -p android` → production → *Google Service
   Account* → *Manage your FCM V1 service account key* → upload. Then delete your local copy or keep it in a
   password manager.
4. Build again; test with the app's debug screen → **Send a test push** (guide **Running and operating**).

### 5d. Service account so `eas submit` can upload to Play

1. Google Cloud Console (project Roosters+) → **APIs & Services → Library** → enable **Google Play Android
   Developer API**.
2. **IAM & Admin → Service accounts → Create**: name `eas-submit`, no project roles. Open it → **Keys → Add key →
   JSON** (secret, same care as above).
3. Play Console (the account level, not the app) → **Users and permissions → Invite new users** → the service
   account's e-mail (`eas-submit@…iam.gserviceaccount.com`) → app permissions for Roosters+: *Release to testing
   tracks* and *Manage testing tracks and edit tester lists* (add *Release to production* later) → invite.
4. `npx eas-cli@latest credentials -p android` → production → *Google Service Account* → *Manage your Google
   Service Account Key for Play Store Submissions* → upload the JSON.

### 5e. Build, upload, testers

```bash
npx eas-cli@latest build -p android --profile production     # an .aab; the first time EAS creates the keystore (keep it in EAS)
npx eas-cli@latest submit -p android --profile production    # to the internal testing track, as a draft
```

1. Play Console → **Test and release → Testing → Internal testing**: open the draft release → **Review release →
   Start rollout**. (If the API upload is refused the very first time, upload the `.aab` from the EAS build page by
   hand here once.)
2. **Testers** tab → create an e-mail list (Google accounts of your testers, up to 100) → save → copy the **join
   link**. Testers open it on their Android phone, accept, and install from Play. Updates arrive through Play.
3. Now add the Play app signing SHA-1 as an Android OAuth client (5b), or Google sign-in fails for these installs.
4. For closed testing and production, Play wants the **store listing** (descriptions, icon 512×512, feature graphic
   1024×500, screenshots) and **App content**: privacy policy URL, *App access* (same text as for Apple's
   reviewer: guest mode, no account needed), ads (none), content rating questionnaire, target audience (students:
   18+ keeps you out of the Families rules; pick what's true), **Data safety** (we collect e-mail address, name,
   profile photo, messages in chat, timetable data, push token; encrypted in transit; users can delete their
   account), and the government/financial/health declarations (no).
5. Personal account: promote to **Closed testing**, get 12+ testers opted in for 14 days, then **Apply for
   production** in the dashboard.

Fast Android testing without Play: `npx eas-cli@latest build -p android --profile preview` gives an install link /
QR code for an APK; testers allow "install unknown apps" once. Google sign-in on those needs the EAS key's SHA-1
client from 5b.

## Every next version

```bash
cd app/mobile
# raise "version" in app.json for a new version (build numbers count up by themselves)
npx eas-cli@latest build -p all --profile production --auto-submit
```

Then add the iOS build to the TestFlight groups (internal groups can get new builds automatically) and roll out the
Android draft in Play. JavaScript-only fixes can also go out without a store build through **EAS Update**
(`expo-updates`), not set up yet.

## When it doesn't work

| Symptom | Look at |
| --- | --- |
| TestFlight build: "That didn't work" everywhere | `EXPO_PUBLIC_API_URL` not set for the build's environment (`eas env:list`), or not `https://` |
| `curl https://api…` fails, Caddy logs ACME errors | DNS doesn't point at the server yet, or port 80/443 isn't forwarded |
| Login codes never arrive in production | `MAIL_MODE`, `SMTP_*`, SPF/DKIM at the provider; `roosters.cli debug` and `test-mail` |
| Apple sign-in: server says it didn't work | `APPLE_CLIENT_IDS=be.roostersplus.app` in the server `.env` |
| Google: account picker closes without signing in (Android) | no Android OAuth client for the SHA-1 that signed *this* install (EAS key vs Play signing key) |
| Google: "not available yet" | empty `GOOGLE_CLIENT_IDS` on the server |
| No Google button | build made before the `EXPO_PUBLIC_GOOGLE_*` variables were set |
| No push on Android | no `google-services.json` in the build, or no FCM V1 key in EAS (5c) |
| No push on iOS | push key not created at the first build: `eas credentials -p ios` → push notifications |
| Play: "Only releases with status draft may be created on draft app" | keep `releaseStatus: draft` until the first release is rolled out |
| Play: "package name already used" / upload key mismatch | the app must always be signed with the same EAS keystore: never delete it in `eas credentials` |
