CREATE TABLE IF NOT EXISTS auth_revocations (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  expires_at BIGINT NOT NULL,
  KEY idx_auth_revocations_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auth_invalidations (
  user_id INT NOT NULL PRIMARY KEY,
  invalid_before BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
