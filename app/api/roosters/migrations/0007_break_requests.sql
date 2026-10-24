-- Break requests (roosters/breaks.py): "Pauze samen?" Someone asks one or more friends to spend a break together:
-- I come to you, you come to me, or meet at a place, from-until. Each person asked answers yes or no
-- (or proposes another time: a new request the other way, counter_of points at the one it answers).
-- cancelled_at: the one who asked took it back. Times of day are minutes since midnight in the school's timezone.
CREATE TABLE IF NOT EXISTS break_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  from_id INT NOT NULL,
  day DATE NOT NULL,
  start_min SMALLINT NOT NULL,
  end_min SMALLINT NOT NULL,
  mode ENUM('i_come','you_come','meet') NOT NULL DEFAULT 'meet',
  place VARCHAR(120) NULL,
  note VARCHAR(200) NULL,
  counter_of INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at DATETIME NULL,
  KEY k_from_day (from_id, day)
);

CREATE TABLE IF NOT EXISTS break_request_members (
  request_id INT NOT NULL,
  user_id INT NOT NULL,
  response ENUM('pending','accepted','declined') NOT NULL DEFAULT 'pending',
  responded_at DATETIME NULL,
  PRIMARY KEY (request_id, user_id),
  KEY k_user (user_id)
);
