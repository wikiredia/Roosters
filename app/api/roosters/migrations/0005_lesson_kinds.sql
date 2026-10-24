-- The kind of a lesson (roosters/kinds.py: theory, lab, exercises, project, support, internship, info, exam,
-- other), worked out from Untis' free text and the subject when the lesson is fetched. Only the kind is kept.
ALTER TABLE class_lessons ADD COLUMN kind VARCHAR(16) NOT NULL DEFAULT 'other' AFTER location;
ALTER TABLE source_lessons ADD COLUMN kind VARCHAR(16) NOT NULL DEFAULT 'other' AFTER location;
