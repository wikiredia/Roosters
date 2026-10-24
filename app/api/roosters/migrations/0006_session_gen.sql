-- Refresh-token generations (roosters/tokens.py): gen counts rotations, seen_gen is the newest generation the
-- phone has used. A previous refresh token is a retry after a lost answer as long as the newer pair was never
-- used (seen_gen < gen); only after that it means a copy is in someone else's hands.
-- revoked_reason says why a session ended (logout, logout_all, reuse, guest_signed_in, disabled, admin):
-- the app shows it in its debug log, so "your session expired" is never a mystery.
ALTER TABLE sessions ADD COLUMN gen INT NOT NULL DEFAULT 0 AFTER rotated_at;
ALTER TABLE sessions ADD COLUMN seen_gen INT NOT NULL DEFAULT 0 AFTER gen;
ALTER TABLE sessions ADD COLUMN revoked_reason VARCHAR(16) NULL AFTER revoked_at;
