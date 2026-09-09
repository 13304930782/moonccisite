CREATE TABLE IF NOT EXISTS oauth_providers (
  provider VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  enabled TINYINT NOT NULL DEFAULT 0,
  client_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
  secret_cipher TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS oauth_identities (
  provider VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  client_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  subject VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (provider, client_id, subject),
  UNIQUE KEY uniq_oauth_user (user_id, provider, client_id),
  CONSTRAINT fk_oauth_identity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash CHAR(64) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  browser_hash CHAR(64) CHARACTER SET ascii NOT NULL,
  provider VARCHAR(16) CHARACTER SET ascii NOT NULL,
  config_version INT NOT NULL,
  client_id VARCHAR(255) CHARACTER SET ascii NOT NULL,
  verifier VARCHAR(128) CHARACTER SET ascii NOT NULL,
  user_id INT NULL,
  session_hash CHAR(64) CHARACTER SET ascii NULL,
  started_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  return_to VARCHAR(200) NOT NULL,
  KEY idx_oauth_states_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS oauth_registrations (
  token_hash CHAR(64) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  provider VARCHAR(16) CHARACTER SET ascii NOT NULL,
  client_id VARCHAR(255) CHARACTER SET ascii NOT NULL,
  config_version INT NOT NULL,
  subject VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  display_name VARCHAR(80) NOT NULL,
  started_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  return_to VARCHAR(200) NOT NULL,
  email VARCHAR(120) NOT NULL DEFAULT '',
  code_hash CHAR(64) CHARACTER SET ascii NOT NULL DEFAULT '',
  code_expires_at BIGINT NOT NULL DEFAULT 0,
  sent_at BIGINT NOT NULL DEFAULT 0,
  attempts INT NOT NULL DEFAULT 0,
  KEY idx_oauth_registration_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
