CREATE TABLE IF NOT EXISTS electricity_midnight_snapshots (
  scope_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  boundary_date DATE NOT NULL,
  payload JSON NOT NULL,
  PRIMARY KEY (scope_key, boundary_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS electricity_daily_usage (
  scope_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  usage_date DATE NOT NULL,
  payload JSON NOT NULL,
  PRIMARY KEY (scope_key, usage_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE electricity_snapshots
  ADD COLUMN cumulative_reading DECIMAL(18,6) DEFAULT NULL COMMENT 'Actual upstream meter reading, kWh, never synthesized',
  ADD COLUMN cumulative_reading_source VARCHAR(80) DEFAULT NULL;
