-- Semesters: a school year has two (S1, S2). Dates as 'MM-DD' because they repeat every year:
-- S1 runs from year_start until the day before s2_start, S2 from s2_start until year_end.
ALTER TABLE schools ADD COLUMN year_start CHAR(5) NOT NULL DEFAULT '09-01' AFTER tz;
ALTER TABLE schools ADD COLUMN s2_start CHAR(5) NOT NULL DEFAULT '02-01' AFTER year_start;
ALTER TABLE schools ADD COLUMN year_end CHAR(5) NOT NULL DEFAULT '07-15' AFTER s2_start;

-- Which semester a class exists in (Untis lists the classes of one date: we ask once per semester)
ALTER TABLE school_classes ADD COLUMN in_s1 TINYINT NOT NULL DEFAULT 1 AFTER active;
ALTER TABLE school_classes ADD COLUMN in_s2 TINYINT NOT NULL DEFAULT 1 AFTER in_s1;
-- The course list of the whole school year (class_courses): when it was last fetched, and why it failed
ALTER TABLE school_classes ADD COLUMN courses_scanned_at DATETIME NULL AFTER last_error;
ALTER TABLE school_classes ADD COLUMN courses_error VARCHAR(500) NULL AFTER courses_scanned_at;

-- Every course a class has this school year, per semester: what onboarding lets you pick from,
-- so a course that only starts in a few weeks (or in S2) can be chosen today.
CREATE TABLE IF NOT EXISTS class_courses (
  school_class_id INT NOT NULL,
  semester TINYINT NOT NULL,
  course VARCHAR(200) NOT NULL,
  lessons SMALLINT NOT NULL DEFAULT 0,
  first_day DATE NOT NULL,
  last_day DATE NOT NULL,
  PRIMARY KEY (school_class_id, semester, course)
);

-- A class you follow in one semester only (1 or 2); NULL = the whole school year
ALTER TABLE sources ADD COLUMN semester TINYINT NULL AFTER school_class_id;
