---
updated: 2026-10-30T09:30:00Z
---

Operations on **whole accounts**, used by several routes so they behave the same everywhere:

- `delete_user` is used by 'Delete account' in the app (`r_me.delete_account`), by the console
  (`admin.delete_user`), by guest cleanup (`worker._cleanup`) and by `fold_guest`.
- `fold_guest` runs when a **guest signs in with an address that already has an account**
  (`r_auth._existing`).

**When you add a table with a `user_id`**, add it to `_OWNED` (or handle it in `delete_user`), otherwise
deleted accounts leave rows behind. GDPR deletion must be complete; `tests/test_friends.py::
test_delete_account_removes_everything` checks it.

## `_OWNED`

Tables whose rows belong to exactly one user and are deleted with the account (also `skipped_lessons`; sessions take their push tokens with
them; `push_settings` is Meldingen; `detail_layouts` is how you show lesson details). Friendships, requests and blocks have two user columns and are handled separately.

## `delete_user`

Deletes the account and everything linked to it, inside the caller's transaction: the test people it made
(`testdata.py`), owned rows, both sides of friendships, requests and blocks, break requests and answers (`breaks.delete_user`), chats, messages and reports (`chat.delete_user`), then the user row. Nothing is soft-deleted.

## `fold_guest`

The existing account wins. What the guest set up comes along only where the account has nothing yet:
- the school and campus, if the account has no school;
- the guest's timetable sources (and their lessons, hidden courses and lesson details layouts), if the account has none;
- the onboarded timestamp, if the account never finished onboarding.

Then the guest is deleted. Tested in `tests/test_guests.py` (`..._folds_the_guest_in`,
`test_an_existing_timetable_wins_over_the_guest`).
