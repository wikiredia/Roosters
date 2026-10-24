-- Profile photos (r_me.put_photo): a small square JPEG per user, served by GET /api/v1/users/{id}/photo to the
-- people who may see it. users.photo_v changes with every new photo (NULL: no photo, the coloured initial shows),
-- so the app can cache an image per version.
ALTER TABLE users ADD COLUMN photo_v INT NULL;
CREATE TABLE IF NOT EXISTS user_photos (
  user_id INT PRIMARY KEY,
  jpeg MEDIUMBLOB NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)
