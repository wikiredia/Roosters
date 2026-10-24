-- Weeks of a class fetched on demand: any week, past or future, beyond the weeks the routine sync keeps
-- fresh (config.WEEKS_AHEAD). One row per class and week (its Monday); the lessons go into class_lessons.
CREATE TABLE IF NOT EXISTS class_weeks (
  school_class_id INT NOT NULL,
  monday DATE NOT NULL,
  fetched_at DATETIME NOT NULL,
  error VARCHAR(500) NULL,
  PRIMARY KEY (school_class_id, monday)
);
