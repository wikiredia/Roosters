-- Wordt bij elke start van de API uitgevoerd; alles is idempotent.

CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(64) PRIMARY KEY,
  v MEDIUMTEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS people (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  feed_token_hash CHAR(64) NULL,
  feed_token_enc VARBINARY(512) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  UNIQUE KEY uq_feed (feed_token_hash)
);

-- kind: campus (schoolcampus), home (woonplaats), friends (vriendengroep)
CREATE TABLE IF NOT EXISTS user_groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  kind ENUM('campus','home','friends') NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id INT NOT NULL,
  person_id INT NOT NULL,
  PRIMARY KEY (group_id, person_id),
  KEY k_person (person_id)
);

-- Een toestel = één cookie. status: pending (wacht op Reda), approved, denied, blocked
CREATE TABLE IF NOT EXISTS devices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  token_hash CHAR(64) NOT NULL,
  person_id INT NULL,
  status ENUM('pending','approved','denied','blocked') NOT NULL DEFAULT 'pending',
  is_admin TINYINT NOT NULL DEFAULT 0,
  ip VARCHAR(45) NULL,
  ua VARCHAR(255) NULL,
  city VARCHAR(120) NULL,
  lat DECIMAL(9,6) NULL,
  lon DECIMAL(9,6) NULL,
  acc INT NULL,
  activity JSON NULL,
  linked_from INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at DATETIME NULL,
  UNIQUE KEY uq_token (token_hash),
  KEY k_person (person_id),
  KEY k_status (status)
);

CREATE TABLE IF NOT EXISTS sources (
  id INT AUTO_INCREMENT PRIMARY KEY,
  person_id INT NOT NULL,
  kind ENUM('untis','ics','file') NOT NULL,
  label VARCHAR(160) NOT NULL,
  config JSON NULL,
  secret_enc VARBINARY(4096) NULL,
  file_data MEDIUMBLOB NULL,
  last_sync DATETIME NULL,
  last_ok DATETIME NULL,
  last_error VARCHAR(500) NULL,
  refresh_requested TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  KEY k_person (person_id)
);

-- state: normal, cancelled, changed (lokaal/docent/tijd anders), extra, exam, removed (verdwenen)
CREATE TABLE IF NOT EXISTS lessons (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  source_id INT NOT NULL,
  person_id INT NOT NULL,
  uid VARCHAR(190) NOT NULL,
  day DATE NOT NULL,
  start_min SMALLINT NOT NULL,
  end_min SMALLINT NOT NULL,
  title VARCHAR(200) NOT NULL,
  course VARCHAR(200) NOT NULL,
  location VARCHAR(255) NULL,
  teacher VARCHAR(255) NULL,
  info TEXT NULL,
  extra JSON NULL,
  state ENUM('normal','cancelled','changed','extra','exam','removed') NOT NULL DEFAULT 'normal',
  fingerprint CHAR(40) NOT NULL,
  changed_at DATETIME NULL,
  first_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_src_uid (source_id, uid),
  KEY k_person_day (person_id, day)
);

CREATE TABLE IF NOT EXISTS hidden_courses (
  person_id INT NOT NULL,
  course VARCHAR(200) NOT NULL,
  PRIMARY KEY (person_id, course)
);

-- Dagelijkse check-in. status: chilling (al aant chillen), want_chill (ik wil chillen),
-- home (ik ga naar huis), absent (ik ben er vandaag niet)
CREATE TABLE IF NOT EXISTS checkins (
  person_id INT NOT NULL,
  day DATE NOT NULL,
  status ENUM('chilling','want_chill','home','absent','skip') NOT NULL,
  since_min SMALLINT NOT NULL DEFAULT 0,
  until_min SMALLINT NULL,
  with_ids JSON NULL,
  with_text VARCHAR(120) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (person_id, day)
);

CREATE TABLE IF NOT EXISTS plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  creator_id INT NOT NULL,
  day DATE NOT NULL,
  start_min SMALLINT NOT NULL,
  place VARCHAR(120) NOT NULL,
  note VARCHAR(200) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at DATETIME NULL,
  KEY k_day (day)
);

CREATE TABLE IF NOT EXISTS plan_members (
  plan_id INT NOT NULL,
  person_id INT NOT NULL,
  response ENUM('coming','not') NOT NULL,
  PRIMARY KEY (plan_id, person_id)
);

-- Samen naar school/huis: never = nooit meer voorstellen, always = zelf toegevoegd
CREATE TABLE IF NOT EXISTS travel_prefs (
  person_id INT NOT NULL,
  other_id INT NOT NULL,
  pref ENUM('never','always') NOT NULL,
  PRIMARY KEY (person_id, other_id)
);

-- Wie je kent buiten je vriendengroep(en): enkel wie je kent, kan je kiezen bij Vergelijk.
-- known=0: gezien in 'Wie ken je?' maar ken je niet (dan vragen we het niet opnieuw)
CREATE TABLE IF NOT EXISTS known_people (
  person_id INT NOT NULL,
  other_id INT NOT NULL,
  known TINYINT NOT NULL,
  PRIMARY KEY (person_id, other_id)
);

-- Wie je vaak vergelijkt: die staan bovenaan bij Vergelijk (n telt hoogstens één keer per uur)
CREATE TABLE IF NOT EXISTS compare_picks (
  person_id INT NOT NULL,
  other_id INT NOT NULL,
  n INT NOT NULL DEFAULT 1,
  last_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (person_id, other_id)
);

CREATE TABLE IF NOT EXISTS push_subs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_id INT NOT NULL,
  endpoint VARCHAR(600) NOT NULL,
  p256dh VARCHAR(200) NOT NULL,
  auth VARCHAR(100) NOT NULL,
  failures INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_endpoint (endpoint(500)),
  KEY k_device (device_id)
);

CREATE TABLE IF NOT EXISTS notify_prefs (
  person_id INT NOT NULL,
  kind VARCHAR(30) NOT NULL,
  value VARCHAR(30) NOT NULL,
  PRIMARY KEY (person_id, kind)
);

-- person_id 0 = voor alle admin-toestellen
CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  person_id INT NOT NULL,
  kind VARCHAR(30) NOT NULL,
  dedupe VARCHAR(190) NOT NULL,
  title VARCHAR(120) NOT NULL,
  body VARCHAR(600) NOT NULL,
  payload JSON NULL,
  day DATE NOT NULL,
  push TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME NULL,
  UNIQUE KEY uq_dedupe (person_id, dedupe),
  KEY k_person_day (person_id, day),
  KEY k_unsent (sent_at)
);

-- Momentopname van met wie je vandaag nog pauze hebt (om veranderingen te melden)
CREATE TABLE IF NOT EXISTS day_state (
  person_id INT NOT NULL,
  day DATE NOT NULL,
  data JSON NOT NULL,
  PRIMARY KEY (person_id, day)
);

-- Ongedaan maken
CREATE TABLE IF NOT EXISTS actions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_id INT NULL,
  kind VARCHAR(40) NOT NULL,
  summary VARCHAR(200) NOT NULL,
  payload JSON NOT NULL,
  admin_only TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  undone_at DATETIME NULL,
  KEY k_created (created_at)
);

CREATE TABLE IF NOT EXISTS admin_codes (
  code_hash CHAR(64) PRIMARY KEY,
  expires_at DATETIME NOT NULL,
  attempts INT NOT NULL DEFAULT 0
);

-- Koppelen van een tweede toestel (bv. beginscherm-app op iPhone) met een getal van 2 cijfers
CREATE TABLE IF NOT EXISTS link_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_id INT NOT NULL,
  ip VARCHAR(45) NOT NULL,
  number TINYINT NOT NULL,
  options JSON NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  KEY k_ip (ip)
);

-- ---- Pauze-verzoeken: "Reda wil pauze met jou, kan jij?" ------------------------
-- mode: i_come (ik kom naar jou), you_come (jij komt naar mij), meet (afspreken op `place`)
-- Vervangt de oude 'plans' (Afspraken) in de app; die tabel blijft voor oude gegevens.
CREATE TABLE IF NOT EXISTS break_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  from_id INT NOT NULL,
  day DATE NOT NULL,
  start_min SMALLINT NOT NULL,
  end_min SMALLINT NOT NULL,
  mode ENUM('i_come','you_come','meet') NOT NULL DEFAULT 'meet',
  place VARCHAR(120) NULL,
  note VARCHAR(200) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at DATETIME NULL,
  KEY k_day (day),
  KEY k_from (from_id)
);

CREATE TABLE IF NOT EXISTS break_request_members (
  request_id INT NOT NULL,
  person_id INT NOT NULL,
  response ENUM('pending','accepted','declined') NOT NULL DEFAULT 'pending',
  responded_at DATETIME NULL,
  PRIMARY KEY (request_id, person_id),
  KEY k_person (person_id)
);

-- ---- Chat --------------------------------------------------------------------
-- kind: group (hoort bij een vriendengroep of woonplaats, leden = group_members), dm (twee mensen)
CREATE TABLE IF NOT EXISTS chats (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kind ENUM('group','dm') NOT NULL,
  group_id INT NULL,
  dm_a INT NULL,
  dm_b INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_group (group_id),
  UNIQUE KEY uq_dm (dm_a, dm_b)
);

-- kind: text (getypt), event (klein blokje in het midden: "Reda stopt nu met de les").
-- dedupe: zelfde gebeurtenis maar één keer per chat (NULL = geen controle)
CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  chat_id INT NOT NULL,
  person_id INT NULL,
  kind ENUM('text','event') NOT NULL DEFAULT 'text',
  body VARCHAR(2000) NOT NULL,
  payload JSON NULL,
  dedupe VARCHAR(190) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  UNIQUE KEY uq_dedupe (chat_id, dedupe),
  KEY k_chat (chat_id, id)
);

-- Per persoon per chat: tot waar gelezen, en of er pushmeldingen komen (standaard uit)
CREATE TABLE IF NOT EXISTS chat_reads (
  person_id INT NOT NULL,
  chat_id INT NOT NULL,
  last_read BIGINT NOT NULL DEFAULT 0,
  push TINYINT NOT NULL DEFAULT 0,
  PRIMARY KEY (person_id, chat_id)
);

-- Vrije vragen tussen vrienden ("Wil je chillen?"), om spam te beperken
CREATE TABLE IF NOT EXISTS pings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  from_id INT NOT NULL,
  to_id INT NOT NULL,
  kind VARCHAR(30) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY k_to (to_id, created_at)
);
