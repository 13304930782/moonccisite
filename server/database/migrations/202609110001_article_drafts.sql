ALTER TABLE posts ADD COLUMN version INT NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS article_drafts (
  id CHAR(36) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  author_id INT NOT NULL,
  post_id INT NULL,
  base_version INT NULL,
  version INT NOT NULL DEFAULT 1,
  payload JSON NOT NULL,
  dirty BOOLEAN NOT NULL DEFAULT TRUE,
  published_version INT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uniq_article_working_copy(post_id),
  INDEX idx_article_draft_author(author_id,updated_at),
  FOREIGN KEY(author_id) REFERENCES users(id),
  FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
