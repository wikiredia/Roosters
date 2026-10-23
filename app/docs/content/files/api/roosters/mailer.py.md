---
updated: 2026-10-23T17:30:00Z
---

**Sending e-mail.** For now that's only login codes. Mail always goes out from a **job**, never inside a
request: a slow mail server must not make the app wait, and failed sends are retried.

`MAIL_MODE=smtp` sends through `SMTP_HOST` (Mailpit on the laptop: http://localhost:8025 shows every mail).
`console` only logs. With ENV=dev the code is also logged, so you can sign in when mail is broken.

## `_job_send_code`

The `send_login_code` job handler: builds the mail in the user's language (`i18n.login_mail`) and sends it.

## `mask_address`

`j***@school.be`: enough to recognise in a log, without storing the address there.

## `send`

One plain-text mail (STARTTLS and login when configured).
