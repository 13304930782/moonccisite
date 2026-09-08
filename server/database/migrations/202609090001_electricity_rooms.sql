CREATE TABLE IF NOT EXISTS electricity_rooms (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 scope_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 name VARCHAR(100) NOT NULL,
 credentials_encrypted TEXT NOT NULL,
 credential_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 meter_identity CHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL UNIQUE,
 config JSON NOT NULL,
 legacy TINYINT NOT NULL DEFAULT 0,
 active TINYINT NOT NULL DEFAULT 1,
 verified_at DATETIME DEFAULT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS electricity_room_members (
 room_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 user_id INT NOT NULL,
 PRIMARY KEY(room_id,user_id),
 FOREIGN KEY(room_id) REFERENCES electricity_rooms(id) ON DELETE CASCADE,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS electricity_room_state (
 scope_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 low_alert_active TINYINT NOT NULL DEFAULT 0,
 last_low_alert_at DATETIME DEFAULT NULL,
 last_recovered_at DATETIME DEFAULT NULL,
 last_daily_email_date DATE DEFAULT NULL,
 last_daily_email_slot VARCHAR(16) DEFAULT NULL,
 last_success_at DATETIME DEFAULT NULL,
 last_error_at DATETIME DEFAULT NULL,
 last_error_code VARCHAR(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS electricity_room_runs (
 scope_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 run_date DATE NOT NULL,
 run_hour TINYINT UNSIGNED NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'running',
 attempts TINYINT UNSIGNED NOT NULL DEFAULT 1,
 started_at DATETIME NOT NULL,
 error_code VARCHAR(100) DEFAULT NULL,
 PRIMARY KEY(scope_key,run_date,run_hour)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE electricity_snapshots
 DROP INDEX uniq_electricity_snapshot_date,
 ADD UNIQUE KEY uniq_electricity_snapshot_scope_date(scope_key,snapshot_date);
