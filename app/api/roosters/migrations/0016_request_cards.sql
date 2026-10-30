-- Requests in the chat. A break request (breaks.py) and an access request (access.py) are a card in the chat:
-- a chat message of kind 'request', written by the one who asked (user_id), whose payload points at the request:
-- {"type":"break","request":<break_requests.id>} or {"type":"access","request":<access_requests.id>}.
-- The card itself is not a copy: the app gets the request as it is now with every message (chat.messages).
ALTER TABLE chat_messages MODIFY kind ENUM('text','event','request') NOT NULL DEFAULT 'text';

-- "Mag ik je rooster zien?" (access.py): from_id asks to_id to show them more of their timetable (`visibility`:
-- full or norooms). Accepting sets to_id's friendships.visibility toward from_id to that. Only one pending
-- request per pair at a time; unfriending or blocking hides them (like break requests), account deletion
-- deletes them.
CREATE TABLE IF NOT EXISTS access_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  from_id INT NOT NULL,
  to_id INT NOT NULL,
  visibility ENUM('full','norooms') NOT NULL,
  status ENUM('pending','accepted','declined','cancelled') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at DATETIME NULL,
  KEY k_from (from_id, status),
  KEY k_to (to_id, status)
);

-- Today's plan in two parts: `break_status` for your breaks between classes (want_chill: "Ik wil afspreken",
-- busy: "Ik ben bezig": your breaks don't count as free) and `status` for after school (chilling, want_chill)
-- or the day (home, absent). A row may carry only one of them, so status can be NULL now.
ALTER TABLE checkins
  ADD COLUMN break_status ENUM('want_chill','busy') NULL AFTER status,
  MODIFY status ENUM('chilling','want_chill','home','absent') NULL;
