-- "Volg je Python?" (skipasks.py): in Vergelijken, from_id drags one of to_id's classes into the bin and asks
-- whether they'd skip it, because then the two of them share a break (`minutes`: how long that shared break would
-- be, worked out when asking). Only from_id sees the class as skipped while it's open; to_id's own timetable only
-- changes when they say yes (a skipped_lessons row per course in the span). One card in their direct chat (kind
-- 'request', payload {"type":"skip","request":<id>}). Unfriending or blocking hides them, account deletion deletes them.
CREATE TABLE IF NOT EXISTS skip_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  from_id INT NOT NULL,
  to_id INT NOT NULL,
  day DATE NOT NULL,
  start_min SMALLINT NOT NULL,
  end_min SMALLINT NOT NULL,
  -- to_id's course(s) in the span, for to_id's push and card; the asker only gets it when to_id shows them courses
  course VARCHAR(200) NOT NULL,
  minutes SMALLINT NOT NULL,
  status ENUM('pending','accepted','declined','cancelled') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at DATETIME NULL,
  KEY k_from (from_id, status, day),
  KEY k_to (to_id, status, day)
);
