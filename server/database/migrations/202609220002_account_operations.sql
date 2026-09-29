CREATE TABLE IF NOT EXISTS login_sessions (
 id CHAR(36) CHARACTER SET ascii NOT NULL PRIMARY KEY,
 user_id INT NOT NULL,
 token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 started_at BIGINT NOT NULL,
 first_seen BIGINT NOT NULL,
 last_seen BIGINT NOT NULL,
 expires_at BIGINT NOT NULL,
 browser VARCHAR(80) NOT NULL,
 os VARCHAR(80) NOT NULL,
 legacy TINYINT NOT NULL DEFAULT 0,
 KEY sessions_user(user_id,last_seen),
 KEY sessions_expiry(expires_at),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
