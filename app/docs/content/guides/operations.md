---
title: Running and operating
position: 70
updated: 2026-10-24T13:20:00Z
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
