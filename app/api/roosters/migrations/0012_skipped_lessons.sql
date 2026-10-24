-- Classes you skip (r_me.skip): a stretch of one course on one day that you won't be in. schedule.lessons marks
-- the lessons in it `skipped`; they then don't make you busy, so your breaks around them grow and friends can
-- share that time with you. Friends never see that you skipped, only that you're free. A double period skipped
-- at once is one row (start to end of the whole block).
CREATE TABLE IF NOT EXISTS skipped_lessons (
  user_id INT NOT NULL,
  day DATE NOT NULL,
  course VARCHAR(200) NOT NULL,
  start_min SMALLINT NOT NULL,
  end_min SMALLINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, day, course, start_min)
)
