---
updated: 2026-10-23T17:30:00Z
---

Only MySQL and Valkey for running the API tests on the laptop (`docker compose -f docker-compose.test.yml up -d`); data in tmpfs, ports on 127.0.0.1.

## `mysql`, `redis`

Test database `roosters_test` (user/password roosters) and Valkey on their default ports.
