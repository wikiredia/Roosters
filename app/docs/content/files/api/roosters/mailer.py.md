---
updated: 2026-10-30T09:25:00Z
---

**Sending e-mail**: the login code, the welcome, the new-device notice and the goodbye after deleting an
account. The texts and the HTML look are in `mails.py`; this file hands them to the SMTP server. Mail always goes
out from a **job**, never inside a request: a slow mail server must not make the app wait, and failed sends are retried.

`MAIL_MODE=smtp` sends through `SMTP_HOST` (Mailpit on the laptop: http://localhost:8025 shows every mail, with
an HTML, an HTML-source and a Text tab). `console` only logs the text version. With ENV=dev the login code is
also logged, so you can sign in when mail is broken.

Every mail is **multipart/alternative** (plain text + HTML). The logo is not loaded from a server (that would
leak who opens the mail and is blocked by many mail apps): it's `mail_assets/logo.png`, attached to the HTML part
as an inline image (`cid:`).

## `LOGO`

The logo file: the app icon, cropped to the blocks and rounded (192 px, shown at 48). Replace the file to rebrand;
the code keeps working.

## `_logo`

Reads the logo once and keeps it in memory.

## `send`

One mail: `body` is the plain-text version, `html` (optional) the HTML version, with the logo attached to it
(STARTTLS and login when configured). Tests replace this function and read `(to, subject, body)`.

## `send_mail`

Sends a `mails.Mail` (subject + text + html): what every job below calls.

## `mask_address`

`j***@school.be`: enough to recognise in a log, without storing the address there.

## `_job_send_code`

The `send_login_code` job: `{email, code, lang}` → `mails.login_code`. Priority 0 (the user is waiting).

## `_job_send_welcome`

The `send_welcome` job: `{email, name, lang}`. Queued once by `r_auth._welcome_mail`.

## `_job_send_new_device`

The `send_new_device` job: `{email, device, platform, at, lang}`. Queued by `r_auth._warn_new_device`.

## `_job_send_account_deleted`

The `send_account_deleted` job: `{email, lang}`. Queued by `DELETE /me` (`r_me.delete_account`) in the same
transaction that deletes the account. The address is only in the job's payload until it is sent: `jobs._finish` clears it.
