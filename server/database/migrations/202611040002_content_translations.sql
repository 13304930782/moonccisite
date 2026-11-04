CREATE TABLE IF NOT EXISTS content_translations (
 entity_type VARCHAR(32) NOT NULL,
 entity_id VARCHAR(255) NOT NULL,
 locale VARCHAR(10) NOT NULL,
 draft JSON NOT NULL,
 published JSON NULL,
 published_source JSON NULL,
 version INT UNSIGNED NOT NULL DEFAULT 1,
 published_at DATETIME NULL,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY (entity_type,entity_id,locale)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
