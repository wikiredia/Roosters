-- How a student wants the details of their lessons shown (roosters/details.py): which fields their source's data
-- breaks into (Type, Building, Floor, Classroom, Group, ...), under which titles, merged or hidden. One row per
-- student and origin: 'untis:<school_id>' (all classes of a school write rooms the same way) or 'ics:<source_id>'
-- (one calendar link). Written when the student checks it (onboarding, Settings); without a row the app shows what
-- details.detect suggests. Layouts of the same Untis origin are offered to schoolmates as a starting point
-- (r_details.details: titles and structure only, never lessons).
CREATE TABLE IF NOT EXISTS detail_layouts (
  user_id INT NOT NULL,
  origin VARCHAR(40) NOT NULL,
  layout JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, origin),
  KEY k_origin (origin)
);
