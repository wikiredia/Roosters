-- A third choice for what a friend sees of your timetable (r_friends.set_visibility): everything except the rooms
-- ('norooms': what and when, never where). full and freebusy stay as they were.
ALTER TABLE friendships MODIFY visibility ENUM('full','norooms','freebusy') NOT NULL DEFAULT 'full';
