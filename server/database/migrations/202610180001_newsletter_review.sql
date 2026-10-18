CREATE TABLE IF NOT EXISTS newsletter_runs (
  week_start DATE NOT NULL PRIMARY KEY,
  status ENUM('running','completed','skipped','attention') NOT NULL,
  reason VARCHAR(80) NOT NULL,
  item_count INT NOT NULL DEFAULT 0,
  first_checked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_checked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS newsletter_exclusions (
  week_start DATE NOT NULL,
  content_type ENUM('post','update','release') NOT NULL,
  content_id INT NOT NULL,
  PRIMARY KEY (week_start,content_type,content_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
