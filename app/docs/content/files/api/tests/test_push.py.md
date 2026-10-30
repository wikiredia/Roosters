---
updated: 2026-10-30T13:30:00Z
---

Push (`push.py`) against a fake Expo (`expo` fixture: `push._post` replaced, `PUSH_MODE=expo`): the texts, tokens
per session (another account on the same phone takes the token, signing out stops it), Meldingen and quiet hours,
a break request pushed exactly once, Expo unreachable (marks taken off, retried) and DeviceNotRegistered (token
forgotten, from a ticket or a receipt), chat only with the bell on, groups and blocking, a message taken back before
the push.

## `expo`, `_pushes`, `_token`

The fake Expo (`sent`, `receipts`, and `answer` to make it fail); running only the push jobs (onboarding also
queues course scans, which would ask the real Untis); registering a token.

## `TOKEN_A`, `TOKEN_B`, `TODAY`

Two phones, and a fixed day for the pure text tests.

## `test_tokens_and_quiet_hours`, `test_break_texts`, `test_change_texts`, `test_chat_texts`, `test_build_groups_changes_of_a_day`, `test_access_texts`

The pure parts (also: a request's push opens the chat with its card, `/today` without one).

## `test_token_belongs_to_the_session`, `test_settings`

Tokens and Meldingen through the API (and the export, and account deletion).

## `test_break_request_is_pushed_once`, `test_categories_and_quiet_hours`, `test_gone_phone_and_unreachable_expo`, `test_receipts_forget_a_gone_phone`

Notifications → push (a break request's push opens the direct chat with its card).

## `test_chat_only_with_the_bell_on`, `test_group_chat_and_blocking`, `test_message_taken_back_before_the_push`

Chat → push.

## `test_day_is_tomorrow`

The break tests ask for tomorrow (`test_breaks.DAY`); the expected texts rely on it.
