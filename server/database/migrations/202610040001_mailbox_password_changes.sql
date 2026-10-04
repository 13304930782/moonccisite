-- Run before deploying the mailbox password API. Existing mailbox data is unchanged.
CREATE TABLE IF NOT EXISTS mailbox_password_changes (
  user_id INT NOT NULL PRIMARY KEY,
  request_id CHAR(36) CHARACTER SET ascii NOT NULL,
  mailbox_address VARCHAR(120) NOT NULL,
  new_secret TEXT NULL,
  status ENUM('pending','claimed','review','complete') NOT NULL DEFAULT 'pending',
  claimed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_mailbox_password_request (request_id),
  KEY idx_mailbox_password_queue (status, created_at),
  CONSTRAINT fk_mailbox_password_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
