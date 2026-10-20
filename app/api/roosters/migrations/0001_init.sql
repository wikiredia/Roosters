-- Roosters+ v2: first schema. Runs once (python -m roosters.migrate).
-- Times of day are minutes since midnight in the school's timezone; DATETIME columns are UTC.

CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(64) PRIMARY KEY,
  v MEDIUMTEXT NOT NULL
);

-- ---- Schools ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS schools (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(60) NOT NULL,
  name VARCHAR(160) NOT NULL,
  short_name VARCHAR(40) NULL,
  country CHAR(2) NOT NULL DEFAULT 'BE',
  tz VARCHAR(40) NOT NULL DEFAULT 'Europe/Brussels',
  untis_server VARCHAR(120) NULL,
  untis_login VARCHAR(120) NULL,
  active TINYINT NOT NULL DEFAULT 1,
  classes_synced_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_slug (slug)
);

CREATE TABLE IF NOT EXISTS campuses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_school_name (school_id, name)
);

-- One row per class in Untis. The timetable is fetched once per class (not per student)
-- and shared by everyone who follows that class.
CREATE TABLE IF NOT EXISTS school_classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_id INT NOT NULL,
  untis_id INT NOT NULL,
  name VARCHAR(60) NOT NULL,
  long_name VARCHAR(200) NOT NULL DEFAULT '',
  active TINYINT NOT NULL DEFAULT 1,
  last_sync DATETIME NULL,
  last_ok DATETIME NULL,
  last_error VARCHAR(500) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_untis (school_id, untis_id),
  KEY k_school_name (school_id, name)
);

-- state: normal, cancelled, changed (room/time different), extra, exam, removed (disappeared)
-- No teachers and no free text from Untis: we only keep what the app needs (data minimisation).
CREATE TABLE IF NOT EXISTS class_lessons (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  school_class_id INT NOT NULL,
  uid VARCHAR(190) NOT NULL,
  day DATE NOT NULL,
  start_min SMALLINT NOT NULL,
  end_min SMALLINT NOT NULL,
  course VARCHAR(200) NOT NULL,
  location VARCHAR(255) NULL,
  student_group VARCHAR(120) NULL,
  state ENUM('normal','cancelled','changed','extra','exam','removed') NOT NULL DEFAULT 'normal',
  fingerprint CHAR(40) NOT NULL,
  changed_at DATETIME NULL,
  first_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_class_uid (school_class_id, uid),
  KEY k_class_day (school_class_id, day)
);

-- ---- Accounts --------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  display_name VARCHAR(60) NOT NULL,
  email VARCHAR(254) NULL,
  locale ENUM('nl','en') NOT NULL DEFAULT 'nl',
  school_id INT NULL,
  campus_id INT NULL,
  avatar_color TINYINT NOT NULL DEFAULT 0,
  -- Ghost mode: friends see you as 'hidden' until then
  ghost_until DATETIME NULL,
  onboarded_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_email (email),
  KEY k_school (school_id)
);

-- How someone signs in: Apple, Google or a code by e-mail. subject = Apple/Google user id, or the e-mail address.
CREATE TABLE IF NOT EXISTS auth_identities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  provider ENUM('apple','google','email') NOT NULL,
  subject VARCHAR(255) NOT NULL,
  email VARCHAR(254) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME NULL,
  UNIQUE KEY uq_provider_subject (provider, subject),
  KEY k_user (user_id)
);

-- 6-digit login codes. Only keyed hashes (HMAC with SECRET_KEY) are stored.
CREATE TABLE IF NOT EXISTS login_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email_hash CHAR(64) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY k_email (email_hash, created_at)
);

-- One session per signed-in device. The refresh token rotates on every use;
-- prev_refresh_hash catches a retry after a lost answer (slow wifi) vs. a stolen token.
CREATE TABLE IF NOT EXISTS sessions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  refresh_hash CHAR(64) NOT NULL,
  prev_refresh_hash CHAR(64) NULL,
  rotated_at DATETIME NULL,
  device_name VARCHAR(80) NULL,
  platform ENUM('ios','android','web','other') NOT NULL DEFAULT 'other',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  UNIQUE KEY uq_refresh (refresh_hash),
  KEY k_prev (prev_refresh_hash),
  KEY k_user (user_id)
);

-- ---- Friends ---------------------------------------------------------------------

-- Two rows per friendship (A→B and B→A). visibility = what user_id shows to friend_id.
CREATE TABLE IF NOT EXISTS friendships (
  user_id INT NOT NULL,
  friend_id INT NOT NULL,
  visibility ENUM('full','freebusy') NOT NULL DEFAULT 'full',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, friend_id),
  KEY k_friend (friend_id)
);

CREATE TABLE IF NOT EXISTS friend_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  from_id INT NOT NULL,
  to_id INT NOT NULL,
  status ENUM('pending','accepted','declined','cancelled') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at DATETIME NULL,
  KEY k_to (to_id, status),
  KEY k_from (from_id, status)
);

CREATE TABLE IF NOT EXISTS blocks (
  user_id INT NOT NULL,
  blocked_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, blocked_id),
  KEY k_blocked (blocked_id)
);

-- Invite links (<PUBLIC_URL>/i/<code>): whoever opens one becomes friends with the inviter.
CREATE TABLE IF NOT EXISTS invites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  code VARCHAR(16) NOT NULL,
  max_uses INT NOT NULL DEFAULT 50,
  uses INT NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_code (code),
  KEY k_user (user_id)
);

-- ---- Timetables ------------------------------------------------------------------

-- kind untis: follows a school class (lessons in class_lessons, filtered by config include/exclude)
-- kind ics: a personal calendar link (lessons in source_lessons; the link is encrypted)
CREATE TABLE IF NOT EXISTS sources (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  kind ENUM('untis','ics') NOT NULL,
  label VARCHAR(160) NOT NULL,
  school_class_id INT NULL,
  config JSON NULL,
  secret_enc VARBINARY(4096) NULL,
  last_sync DATETIME NULL,
  last_ok DATETIME NULL,
  last_error VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  KEY k_user (user_id),
  KEY k_class (school_class_id)
);

CREATE TABLE IF NOT EXISTS source_lessons (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  source_id INT NOT NULL,
  user_id INT NOT NULL,
  uid VARCHAR(190) NOT NULL,
  day DATE NOT NULL,
  start_min SMALLINT NOT NULL,
  end_min SMALLINT NOT NULL,
  course VARCHAR(200) NOT NULL,
  location VARCHAR(255) NULL,
  state ENUM('normal','cancelled','changed','extra','exam','removed') NOT NULL DEFAULT 'normal',
  fingerprint CHAR(40) NOT NULL,
  changed_at DATETIME NULL,
  first_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_src_uid (source_id, uid),
  KEY k_user_day (user_id, day)
);

CREATE TABLE IF NOT EXISTS hidden_courses (
  user_id INT NOT NULL,
  course VARCHAR(200) NOT NULL,
  PRIMARY KEY (user_id, course)
);

-- Daily check-in: chilling (still around), want_chill, home (going home), absent (not here today)
CREATE TABLE IF NOT EXISTS checkins (
  user_id INT NOT NULL,
  day DATE NOT NULL,
  status ENUM('chilling','want_chill','home','absent') NOT NULL,
  since_min SMALLINT NOT NULL DEFAULT 0,
  until_min SMALLINT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, day)
);

-- ---- Notifications ---------------------------------------------------------------

-- Stored as kind + payload; the app (and later the push sender) turns them into text per language.
CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  kind VARCHAR(30) NOT NULL,
  dedupe VARCHAR(190) NOT NULL,
  payload JSON NULL,
  day DATE NULL,
  push TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at DATETIME NULL,
  push_sent_at DATETIME NULL,
  UNIQUE KEY uq_dedupe (user_id, dedupe),
  KEY k_user (user_id, id)
);

-- ---- Infrastructure ----------------------------------------------------------------

-- Job queue shared by all workers. Claimed with SELECT ... FOR UPDATE SKIP LOCKED.
-- dedupe: at most one waiting job per key (set to NULL when finished).
CREATE TABLE IF NOT EXISTS jobs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  kind VARCHAR(40) NOT NULL,
  dedupe VARCHAR(190) NULL,
  payload JSON NULL,
  status ENUM('queued','running','done','failed') NOT NULL DEFAULT 'queued',
  priority TINYINT NOT NULL DEFAULT 5,
  run_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  locked_by VARCHAR(64) NULL,
  locked_until DATETIME NULL,
  last_error VARCHAR(1000) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  UNIQUE KEY uq_dedupe (dedupe),
  KEY k_ready (status, priority, run_at),
  KEY k_finished (finished_at)
);

-- Idempotency-Key: a retried write (lost answer on bad wifi) gets the same answer instead of running twice.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id INT NOT NULL,
  idem_key VARCHAR(64) NOT NULL,
  method VARCHAR(8) NOT NULL,
  path VARCHAR(255) NOT NULL,
  status_code SMALLINT NULL,
  body MEDIUMTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, idem_key),
  KEY k_created (created_at)
);
