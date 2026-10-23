---
updated: 2026-10-23T17:30:00Z
---

**Safely fetching URLs that users typed** (calendar links), and the provider key sets.

Someone can paste a link to `http://192.168.1.1` or to the database container. So this file:
- allows only http(s) (and webcal → https), on ports 80/443/8080/8443, with no user:password;
- resolves DNS itself and allows **only public IP addresses**;
- connects to **exactly that checked IP** (no second DNS lookup, which would allow DNS rebinding);
- checks every redirect again; limits size (5 MB) and time (20 s); decompresses gzip.

Every outgoing request with a user-supplied host must go through `fetch`. Tests: `tests/test_safety.py`.

## `FetchError`

The URL was refused or the fetch failed (the message is shown to the user).

## `MAX_BYTES`, `TIMEOUT`, `MAX_REDIRECTS`, `USER_AGENT`

Limits and our user agent.

## `_PinnedHTTPConnection`, `_PinnedHTTPSConnection`

HTTP(S) connections to a fixed IP while TLS still checks the hostname's certificate.

## `_public_ip`

Global unicast only (IPv4-mapped IPv6 unwrapped first).

## `check_url`

Scheme, host, port and credentials checks.

## `fetch`

The safe fetch: returns (status, headers, body) after following checked redirects.

## `normalize_url`

webcal:// and webcals:// become https://.

## `resolve_public`

DNS lookup; refuses if **any** address is internal; prefers IPv4.
