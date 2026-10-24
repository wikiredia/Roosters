-- Chat (roosters/chat.py): one-to-one chats between friends and groups of friends.
-- direct_key: 'smaller:bigger' user id for a one-to-one chat (one per pair), NULL for a group.
-- last_message_id: the newest message, so the chat list sorts without scanning messages.
CREATE TABLE IF NOT EXISTS chats (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kind ENUM('direct','group') NOT NULL,
  name VARCHAR(40) NULL,
  direct_key VARCHAR(24) NULL,
  created_by INT NOT NULL,
  last_message_id BIGINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_direct (direct_key)
);

-- Who is in a chat. last_read_id: the newest message they've seen (unread counts, "gelezen").
-- Leaving a group deletes the row.
CREATE TABLE IF NOT EXISTS chat_members (
  chat_id INT NOT NULL,
  user_id INT NOT NULL,
  last_read_id BIGINT NOT NULL DEFAULT 0,
  pinned TINYINT NOT NULL DEFAULT 0,
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (chat_id, user_id),
  KEY k_user (user_id)
);

-- kind text: written by user_id. kind event: something that happened (user_id NULL, payload says what;
-- the app writes the sentence). deleted_at: taken back by the writer, or removed by a moderator (removed=1).
CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  chat_id INT NOT NULL,
  user_id INT NULL,
  kind ENUM('text','event') NOT NULL DEFAULT 'text',
  body VARCHAR(1000) NULL,
  payload JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at DATETIME NULL,
  removed TINYINT NOT NULL DEFAULT 0,
  KEY k_chat (chat_id, id),
  KEY k_user (user_id)
);

-- "Meld dit bericht": what was written (snapshot, also when it's deleted later), by whom, and why.
-- The writer never hears about it. Handled in the admin API (dismissed, removed, or the writer turned off).
CREATE TABLE IF NOT EXISTS chat_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  message_id BIGINT NOT NULL,
  chat_id INT NOT NULL,
  reporter_id INT NOT NULL,
  author_id INT NOT NULL,
  reason ENUM('spam','mean','unsafe','other') NOT NULL,
  note VARCHAR(300) NULL,
  snapshot VARCHAR(1000) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  handled_at DATETIME NULL,
  handled_by VARCHAR(80) NULL,
  outcome ENUM('dismissed','removed','disabled') NULL,
  UNIQUE KEY uq_once (message_id, reporter_id),
  KEY k_open (handled_at)
);
