CREATE TABLE IF NOT EXISTS article_revisions (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 post_id INT NULL,
 draft_id CHAR(36) CHARACTER SET ascii NULL,
 actor_id INT NULL,
 kind ENUM('baseline','auto','manual','publish','restore') NOT NULL,
 payload JSON NOT NULL,
 content_hash CHAR(64) CHARACTER SET ascii NOT NULL,
 published_version INT NULL,
 auto_bucket BIGINT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY revision_publication(post_id,published_version),
 INDEX revision_post(post_id,id),
 INDEX revision_draft(draft_id,id),
 INDEX revision_expiry(kind,updated_at),
 FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
 FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
