CREATE TABLE IF NOT EXISTS updates (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  content TEXT NOT NULL,
  image_url VARCHAR(500) NOT NULL DEFAULT '',
  status ENUM('draft','published') NOT NULL DEFAULT 'draft',
  author_id INT NOT NULL,
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX updates_public (status, published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS projects (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(160) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  summary TEXT NOT NULL,
  content TEXT NOT NULL,
  cover_image VARCHAR(500) NOT NULL DEFAULT '',
  tech_stack TEXT NOT NULL,
  stage ENUM('building','active','maintenance','archived') NOT NULL DEFAULT 'building',
  status ENUM('draft','published') NOT NULL DEFAULT 'draft',
  demo_url VARCHAR(500) NOT NULL DEFAULT '',
  repo VARCHAR(200) NOT NULL DEFAULT '',
  featured_rank INT NULL,
  sync_enabled TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX projects_public (status, featured_rank)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_releases (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  repo VARCHAR(200) NOT NULL,
  github_id BIGINT NOT NULL,
  title VARCHAR(255) NOT NULL,
  content MEDIUMTEXT NOT NULL,
  url VARCHAR(500) NOT NULL,
  published_at DATETIME NOT NULL,
  hidden TINYINT(1) NOT NULL DEFAULT 0,
  source_visible TINYINT(1) NOT NULL DEFAULT 1,
  historical TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY release_identity (project_id, repo, github_id),
  INDEX release_public (published_at, hidden),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS github_sync_state (
  project_id INT NOT NULL PRIMARY KEY,
  repo VARCHAR(200) NOT NULL,
  etag VARCHAR(255) NULL,
  initialized TINYINT(1) NOT NULL DEFAULT 0,
  baseline_at DATETIME NULL,
  last_success_at DATETIME NULL,
  next_attempt_at DATETIME NULL,
  error VARCHAR(255) NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS site_now (
  id TINYINT NOT NULL PRIMARY KEY,
  content TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS subscribers (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  status ENUM('pending','active','unsubscribed') NOT NULL DEFAULT 'pending',
  confirm_hash CHAR(64) NULL,
  confirm_expires DATETIME NULL,
  last_confirmation_at DATETIME NULL,
  confirmed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY confirm_token (confirm_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS newsletter_settings (
  id TINYINT NOT NULL PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO newsletter_settings (id, enabled) VALUES (1, 0);

CREATE TABLE IF NOT EXISTS newsletter_deliveries (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  subscriber_id INT NOT NULL,
  week_start DATE NOT NULL,
  status ENUM('pending','sending','sent','failed','uncertain','skipped') NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at DATETIME NULL,
  error VARCHAR(255) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY subscriber_week (subscriber_id, week_start),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS newsletter_tokens (
 token_hash CHAR(64) NOT NULL PRIMARY KEY,
 subscriber_id INT NOT NULL,
 expires_at DATETIME NOT NULL,
 INDEX token_expiry (expires_at),
 FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
