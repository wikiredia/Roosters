---
updated: 2026-10-24T09:54:20Z
---

`users.test_owner_id`: the account that made a test person (`testdata.py`), NULL for real accounts. The debug routes
(`r_debug.py`) only let an account see, switch to and remove its own test people. Test people made before this
migration have none and show up nowhere; remove them with `docker compose exec db mysql …` or start over with
`docker compose down -v`.
