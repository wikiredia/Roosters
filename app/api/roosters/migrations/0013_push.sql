-- Push notifications (push.py). The Expo push token of a phone sits on its session: signing out, "log out
-- everywhere" and deleting the account stop push to that phone at once, without a table to keep in step.
-- One token belongs to one session at a time (another account signing in on the same phone takes it over).
ALTER TABLE sessions
  ADD COLUMN push_token VARCHAR(200) NULL,
  ADD COLUMN push_token_at DATETIME NULL,
  ADD KEY k_push (push_token);

-- What you want a push for (Ik → Meldingen). No row = the defaults: everything on, no quiet hours.
-- quiet_from / quiet_until: minutes since midnight in the school's timezone; from > until runs past midnight.
CREATE TABLE IF NOT EXISTS push_settings (
  user_id INT PRIMARY KEY,
  requests TINYINT NOT NULL DEFAULT 1,
  changes TINYINT NOT NULL DEFAULT 1,
  chat TINYINT NOT NULL DEFAULT 1,
  quiet_from SMALLINT NULL,
  quiet_until SMALLINT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- The bell per chat: a push for every message in it. Off by default (a busy group shouldn't buzz all day).
ALTER TABLE chat_members ADD COLUMN push TINYINT NOT NULL DEFAULT 0;
