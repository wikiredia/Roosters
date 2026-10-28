---
updated: 2026-10-28T09:00:00Z
---

The one stylesheet of the website on roostersplus.be (`site/`, served by the `site` service in
`docker-compose.prod.yml`). Colors come from `design/claude-design/tokens.css` (navy, you-blue, friend-rose,
together-yellow, warm neutrals), with a dark variant through `prefers-color-scheme`. The fonts are named but not
shipped: visitors without Atkinson Hyperlegible / Bricolage Grotesque get the system font.

The pages next to it are plain HTML (not scanned by the docs): `index.html` (store buttons), `contact.html`
(Apple's support URL), `privacy.html` (privacy policy URL for both stores), `voorwaarden.html`,
`account-verwijderen.html` (Google Play's account deletion URL) and `404.html`. They share the same header and
footer; a new page copies those. The Content-Security-Policy in `infra/site-httpd.conf` allows no scripts and
nothing from other sites, so keep the pages static and self-contained.
