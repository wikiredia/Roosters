---
title: Security model
position: 80
updated: 2026-10-23T17:30:00Z
---

| Threat | Defence | Where |
| --- | --- | --- |
| Stolen database | Login codes, e-mail lookups and refresh tokens only as **keyed hashes**; calendar links **encrypted** | `crypto.py` |
| Stolen refresh token | Rotation on every use; reuse after 2 minutes revokes the session | `tokens.py` |
| Signing in as someone else | Codes rate-limited per IP and address, 5 tries; Apple/Google tokens checked (keys, audience, issuer, nonce); unverified e-mail never links | `r_auth.py`, `providers.py` |
| Impersonation by guests | Guests can't use any social feature and are invisible to others | `deps.verified` |
| SSRF through calendar links | Public IPs only, pinned connections, redirects re-checked, limits | `netfetch.py` |
| Double writes on bad wifi | Idempotency keys | `idempotency.py` |
| Scraping people | Requests only within your school, silent blocking, free/busy and ghost mode | `r_friends.py`, `friends.py` |
| Admin access | Admin API and docs on **127.0.0.1 only**; tokens from `.env`; the console adds them (browser never sees them); every change logged with the device | `admin.py`, compose |
| Secrets in the docs | The docs container never mounts `.env`; the scanner skips dot-files | `docker-compose.yml`, `docs/roostersdocs/scan.py` |
| Container escape | Read-only filesystems, all capabilities dropped, no-new-privileges, unprivileged users, internal network for db/redis | `docker-compose.yml`, Dockerfiles |

The management console itself (client certificates, approval at the laptop, password, CSRF) is
documented in the Smart-Room repo: `deploy/CONSOLE.md`.
