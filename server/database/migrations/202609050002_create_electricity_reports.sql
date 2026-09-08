CREATE TABLE IF NOT EXISTS electricity_reports (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  scope_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  report_date DATE NOT NULL,
  period ENUM('morning','evening') NOT NULL,
  published_at DATETIME(3) NOT NULL COMMENT 'UTC',
  payload JSON NOT NULL,
  UNIQUE KEY uniq_electricity_report_slot (scope_key, report_date, period),
  KEY idx_electricity_report_feed (scope_key, published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS electricity_rss_subscriptions (
  user_id INT NOT NULL,
  scope_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  token_encrypted VARCHAR(512) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, scope_key),
  UNIQUE KEY uniq_electricity_rss_token (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE electricity_snapshots ADD COLUMN scope_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL;
