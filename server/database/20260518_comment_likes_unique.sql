-- Add account lock fields used by server/src/routes/auth.js.
-- Run this once before deploying the matching backend code.

ALTER TABLE users
  ADD COLUMN login_attempts INT NOT NULL DEFAULT 0 AFTER can_comment,
  ADD COLUMN locked_until DATETIME NULL AFTER login_attempts,
  ADD INDEX idx_users_locked_until (locked_until);
