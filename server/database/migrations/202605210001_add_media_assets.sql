CREATE TABLE IF NOT EXISTS media_assets (
  id INT NOT NULL AUTO_INCREMENT,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) DEFAULT '',
  alt_text VARCHAR(255) DEFAULT '',
  url VARCHAR(500) NOT NULL,
  mime VARCHAR(120) DEFAULT '',
  ext VARCHAR(20) DEFAULT '',
  size BIGINT NOT NULL DEFAULT 0,
  width INT DEFAULT NULL,
  height INT DEFAULT NULL,
  quality VARCHAR(30) DEFAULT '',
  status ENUM('active','trashed') NOT NULL DEFAULT 'active',
  uploaded_by INT DEFAULT NULL,
  deleted_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_media_assets_filename (filename),
  KEY idx_media_assets_status_updated (status, updated_at),
  KEY idx_media_assets_uploaded_by (uploaded_by),
  CONSTRAINT fk_media_assets_uploaded_by
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
