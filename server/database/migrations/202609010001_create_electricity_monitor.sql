CREATE TABLE IF NOT EXISTS electricity_snapshots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  snapshot_date DATE NOT NULL,
  recorded_at DATETIME NOT NULL,
  room_name VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  meter_id VARCHAR(100) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  device_name VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  meter_status VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  today_use DECIMAL(12,3) DEFAULT NULL,
  purchased_remaining DECIMAL(12,3) DEFAULT NULL,
  subsidy_remaining DECIMAL(12,3) DEFAULT NULL,
  total_remaining DECIMAL(12,3) DEFAULT NULL,
  price DECIMAL(12,4) DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_electricity_snapshot_date (snapshot_date),
  KEY idx_electricity_recorded_at (recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS electricity_monitor_state (
  id TINYINT UNSIGNED NOT NULL,
  low_alert_active TINYINT(1) NOT NULL DEFAULT 0,
  last_low_alert_at DATETIME DEFAULT NULL,
  last_recovered_at DATETIME DEFAULT NULL,
  last_daily_email_date DATE DEFAULT NULL,
  last_success_at DATETIME DEFAULT NULL,
  last_error_at DATETIME DEFAULT NULL,
  last_error_code VARCHAR(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO electricity_monitor_state (id) VALUES (1);
