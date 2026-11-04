CREATE TABLE IF NOT EXISTS post_translations (
 post_id INT NOT NULL,
 locale VARCHAR(5) CHARACTER SET ascii NOT NULL,
 title VARCHAR(255) NOT NULL,
 summary TEXT NOT NULL,
 content LONGTEXT NOT NULL,
 status ENUM('draft','published') NOT NULL DEFAULT 'draft',
 version INT NOT NULL DEFAULT 1,
 source_hash CHAR(64) CHARACTER SET ascii NOT NULL,
 published_at DATETIME(3) NULL,
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(post_id,locale),
 FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
