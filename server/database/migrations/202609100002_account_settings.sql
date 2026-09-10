CREATE TABLE IF NOT EXISTS account_profiles (
  user_id INT NOT NULL PRIMARY KEY,
  avatar_url VARCHAR(255) NOT NULL DEFAULT '',
  deleted_at DATETIME NULL,
  version INT NOT NULL DEFAULT 1,
  CONSTRAINT fk_account_profile_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS account_challenges (
  id CHAR(64) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  session_hash CHAR(64) CHARACTER SET ascii NOT NULL,
  purpose VARCHAR(16) CHARACTER SET ascii NOT NULL,
  old_email VARCHAR(120) NOT NULL,
  new_email VARCHAR(120) NOT NULL DEFAULT '',
  old_code_hash CHAR(64) CHARACTER SET ascii NOT NULL,
  new_code_hash CHAR(64) CHARACTER SET ascii NOT NULL DEFAULT '',
  attempts INT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  INDEX idx_account_challenge_user(user_id,purpose,created_at),
  CONSTRAINT fk_account_challenge_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
