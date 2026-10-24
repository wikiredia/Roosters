---
title: Running and operating
position: 70
updated: 2026-10-24T13:45:00Z
---

## Start, stop, update

```bash
cd app && cp .env.example .env          # once; on a server: new secrets
docker compose up -d --build            # everything; migrations run first
docker compose logs -f api worker       # what's happening
docker compose up -d --build api worker # after pulling new code
docker compose down                     # stop (data stays); add -v to start over empty
```

From the console: **Roosters+ → Overview** (Up, Restart, shells), or the **Docker** section.

## Ports

| Port | Service | Reachable from |
| --- | --- | --- |
| 8000 | api | the network (phones) |
| 8025 | mailpit | the network (laptop only) |
| 8090 | admin | this laptop only |
| 8095 | docs | this laptop only |
| 8001 | toxiproxy ('school wifi') | with `--profile slow` |

## First run checklist

1. `.env` with `ADMIN_TOKEN` and `DOCS_TOKEN` (32+ characters).
2. Console → Roosters+ → **Connection**: all green.
3. **Schools & classes → + Add school** (search Untis); the class list arrives within seconds.
4. Overview → **Send test mail**: check Mailpit (http://localhost:8025).

## Troubleshooting

| Symptom | Look at |
| --- | --- |
| Login code never arrives | Overview → Health (worker running? mail reachable?) and hints; `GET /api/v1/debug` on the laptop |
| The app says 'That didn't work' | The app's debug screen (server address, last requests) |
| A class shows old lessons | Schools → Classes (sync errors) → Fetch now; Background jobs |
| No schools in onboarding | Schools & classes: add one, or turn it on |
| No 'Ga verder met Google' button | The app's debug screen → **Sign in with Google** (says why: Expo Go, no client ids, an old build) |
| Google sign-in fails | Debug builds show Google's code under the error; 'not available yet' = empty `GOOGLE_CLIENT_IDS`; 'didn't work' from the server = wrong audience (not the web client id); on Android a silent cancel after picking an account = missing SHA-1 |
| No push arrives | The app's debug screen → **Send a test push** (says what's missing on the phone); `docker compose logs worker` (`push to …`, refusals); `PUSH_MODE` in `.env` |

## Push notifications

The worker sends them through Expo's push service (`api/roosters/push.py`): no account or key needed on the server
(`PUSH_MODE=expo`, the default; `console` only logs). What the phone needs:

1. An EAS project: `cd mobile && npx eas-cli init` (adds `extra.eas.projectId` to `app.json`).
2. A development build (`npx expo run:ios|android` or `eas build --profile development`): Expo Go on Android can't
   get push. iOS needs an Apple developer account (EAS sets up the push key); Android needs FCM credentials
   uploaded to EAS (`eas credentials`).
3. Ik → Meldingen → **Zet meldingen aan**.

Turning on "enhanced push security" in the Expo dashboard later means setting `EXPO_ACCESS_TOKEN` in `.env`.

## Sign in with Google

Needs client ids from Google Cloud and a development build. In [Google Cloud Console](https://console.cloud.google.com/),
one project:

1. **Google Auth Platform → Branding / Audience**: app name Roosters+, support e-mail; while the audience is
   *Testing* only the test users you add can sign in, so publish it for real use. Scopes: the default
   `openid`, `email`, `profile` are all we need.
2. **Clients → Create client**, three times:
   - **Web application** ('Roosters+ server', no redirect URIs). Its client id goes in **both**
     `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (app) and `GOOGLE_CLIENT_IDS` (server `.env`): it's the audience of every
     ID token.
   - **iOS**, bundle id `be.roostersplus.app`. Its client id goes in `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`;
     `mobile/app.config.ts` makes the URL scheme (`com.googleusercontent.apps.…`) from it.
   - **Android**, package `be.roostersplus.app` + the **SHA-1** of the key that signs the build. One Android client
     per key: the debug keystore for `npx expo run:android` (`keytool -list -v -keystore android/app/debug.keystore
     -alias androiddebugkey -storepass android`), the EAS keystore (`npx eas-cli credentials -p android`), and for
     the Play Store the **app signing key** (Play Console → Release → Setup → App integrity → App signing key certificate). Its id isn't put
     anywhere: Google recognises the app by package and SHA-1.
3. App: put the two `EXPO_PUBLIC_GOOGLE_*` values in `app/mobile/.env` (client ids aren't secret; `.env.local` if
   you'd rather not commit them) or in the EAS environment, then make a **new** build (`npx expo run:ios|android`,
   `eas build`) and start Metro with `-c`.
4. Server: `GOOGLE_CLIENT_IDS=<web client id>` in `app/.env` (comma-separated if there are more), then
   `docker compose up -d api`.

No Firebase and no `google-services.json` / `GoogleService-Info.plist` needed.

## Backups

The `db` volume (MySQL) holds everything that matters; the `docs` volume holds the docs (also in git via
`docs/sync.sh pull`). Redis holds nothing that needs backing up.

From the console: **Roosters+ → Overview → Backups → Back up now** makes a gzipped `mysqldump` and a copy of
the docs database in a folder on the laptop (the newest 14 of each kept); **Connection → Settings → Back up
once a day** does it daily. By hand:

```bash
docker exec roostersplus-db-1 sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction roosters' | gzip > roosters.sql.gz
zcat roosters.sql.gz | docker exec -i roostersplus-db-1 sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" roosters'   # restore
```
