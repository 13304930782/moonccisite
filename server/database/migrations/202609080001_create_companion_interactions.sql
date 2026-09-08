CREATE TABLE IF NOT EXISTS weather_companion_interactions (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  interaction_date DATE NOT NULL COMMENT 'Asia/Shanghai business date',
  kind ENUM('pet', 'hit') NOT NULL,
  created_at DATETIME(3) NOT NULL COMMENT 'UTC',
  KEY idx_companion_daily (interaction_date, kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
