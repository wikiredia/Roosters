---
updated: 2026-10-30T09:25:00Z
---

**Every e-mail the server writes**, in Dutch and English, in one look: a navy header with the logo and the
Roosters+ wordmark, the blue / pink / yellow stripe (you, friends, together: the colours of the app), a white card,
a quiet footer saying why you got it. Dark mode follows the reader's setting, and the layout works at phone width.

One function per mail returns a `Mail` (subject, plain text, HTML). `mailer.py` sends it from a job.

| Mail | When | Function |
| --- | --- | --- |
| Login code | `POST /auth/email/start` | `login_code` |
| Welcome | an account gets a verified address (new, or a guest who signed in), once | `welcome` |
| New sign-in | an existing account signs in on a phone it has not used before | `new_device` |
| Account deleted | `DELETE /me` for an account with an address | `account_deleted` |
| Test mail | `cli test-mail`, `POST /debug/mail` | `mail_check` |

**What to watch out for**
- Mail apps are not browsers: the layout is **tables with inline styles** (Outlook ignores most CSS). Only
  dark mode and the small-screen padding use a `<style>` block with classes. Don't 'modernise' it into flexbox.
- **Everything dynamic is escaped** (`html.escape`): the device name comes from the phone.
- The plain-text version must stay good: tests and tools read the sign-in code from it (`123 456`, spaced).
- Texts live here, not in `i18n.py` (errors only) and not in the app.
- To check how a mail looks, send one to Mailpit (`python -m roosters.cli test-mail you@example.com`), or render
  `Mail.html` and open it in a browser (replace `cid:roosters-logo` with a file path to see the logo).

## `LOGO_CID`

The content id of the inline logo (`<img src="cid:roosters-logo">`); `mailer.send` attaches the file under this id.

## `NAVY`, `BLUE`, `PINK`, `YELLOW`, `SANS`

The brand colours (the same hex values as `mobile/src/global.css`) and the system font stack (the app's own fonts can't be loaded in a mail).

## `Mail`

Subject, text and HTML of one mail.

## `_t`

Picks the Dutch or the English text (anything that is not `nl` is English, like `i18n.lang_of`).

## `_p`, `_code_box`, `_facts`, `_steps`, `_notice`

The building blocks of a card: a paragraph, the six big digit tiles, a label/value table, numbered steps in the three brand colours, and a quiet note with a coloured edge.

## `_layout`

The shared frame around a mail: header, stripe, card, footer, dark-mode and mobile CSS, and a hidden preview line (the 'preheader' the inbox list shows after the subject).

## `_text`

Joins the paragraphs of the plain-text version and adds the sign-off.

## `login_code`

The 6-digit code as big tiles. Says how long it is valid (`LOGIN_CODE_TTL`) and that ignoring the mail is fine.

## `welcome`

Greets by name when there is a real one, then three steps (school and class, friends, a break together) and a privacy line.

## `new_device`

A security notice with the device, platform and time (shown in the default timezone) and what to do if it wasn't them (Settings → Log out everywhere).

## `account_deleted`

Confirms the deletion and what was removed. The last mail the person gets.

## `mail_check`

A short mail to try the setup, in the same look.
