---
updated: 2026-10-23T17:30:00Z
---

**Sign in with Apple and Google.** The app gets an ID token (a JWT signed by Apple/Google) and sends it
here. We check the signature against their public keys (JWKS, cached for an hour per process), the
**audience** (our app ids from `config.APPLE_CLIENT_IDS` / `GOOGLE_CLIENT_IDS`) and the **issuer**.

Without client ids configured, both answer 503 `provider_unavailable` (the app then hides the button or
shows the error).

## `APPLE_KEYS`, `APPLE_ISSUERS`, `GOOGLE_KEYS`, `GOOGLE_ISSUERS`, `JWKS_TTL`

Where the public keys live, which issuers are accepted, and how long keys are cached.

## `Identity`

What a verified token tells us: provider, subject (their stable user id), e-mail and whether it is verified.

## `_load_jwks`, `_key_for`, `_find`

Fetch (through `netfetch.fetch`) and cache the key sets. An unknown `kid` triggers one reload (keys rotate). If the provider is unreachable and nothing is cached: 503.

## `_verified`

Apple sends `email_verified` as the text 'true', Google as a boolean.

## `_verify`

Decode and check the JWT: RS256, our audiences, required claims, 60 s clock leeway, issuer.

## `apple`

Also checks the **nonce**: the app gives Apple sha256(nonce) and sends us the nonce itself, so a stolen token can't be replayed.

## `google`

Google ID token → Identity.
