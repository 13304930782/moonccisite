ALTER TABLE comments
  MODIFY post_id INT NULL,
  ADD COLUMN update_id INT NULL AFTER post_id,
  ADD INDEX idx_comments_update (update_id),
  ADD CONSTRAINT fk_comments_update FOREIGN KEY (update_id) REFERENCES updates(id) ON DELETE CASCADE;
