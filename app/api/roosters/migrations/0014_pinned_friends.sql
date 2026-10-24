-- Pinned friends (r_friends.edit_friend): the few friends you want on top wherever friends are listed (the friends
-- list, Today's board, Vergelijken). On your own row of the friendship (user_id = you), so a pin is only yours: the
-- friend never learns you pinned them. It goes with the friendship: unfriending, blocking and deleting the account
-- all delete the row, so becoming friends again starts unpinned.
ALTER TABLE friendships ADD COLUMN pinned TINYINT NOT NULL DEFAULT 0;
