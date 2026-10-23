-- Guests: an account made on the phone without signing in (no e-mail, no Apple/Google yet).
-- They can use their own timetable; friends and invites wait until they add a sign-in method.
ALTER TABLE users ADD COLUMN is_guest TINYINT NOT NULL DEFAULT 0 AFTER email;

-- Turned off from the management console: can't sign in, existing sessions are revoked.
ALTER TABLE users ADD COLUMN disabled_at DATETIME NULL AFTER onboarded_at;

-- What the management console changed, and when (who = the console device name it sends).
CREATE TABLE IF NOT EXISTS admin_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  actor VARCHAR(80) NOT NULL,
  action VARCHAR(60) NOT NULL,
  target VARCHAR(160) NULL,
  detail MEDIUMTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY k_created (created_at)
);
