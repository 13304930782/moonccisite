-- Apply only with the separately reviewed mailbox backend release.
CREATE TABLE IF NOT EXISTS mailbox_access (
  user_id INT NOT NULL PRIMARY KEY,
  requested_local_part VARCHAR(64) NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  status ENUM('pending','provisioning','active','rejected','revoked') NOT NULL DEFAULT 'pending',
  mailbox_address VARCHAR(120) DEFAULT NULL,
  smtp_secret TEXT NULL,
  provision_request_id CHAR(36) DEFAULT NULL,
  provision_claimed_at DATETIME DEFAULT NULL,
  daily_limit SMALLINT UNSIGNED NOT NULL DEFAULT 10,
  reviewer_id INT DEFAULT NULL,
  review_note VARCHAR(1000) DEFAULT NULL,
  reviewed_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_mailbox_access_local_part (requested_local_part),
  UNIQUE KEY uq_mailbox_access_address (mailbox_address),
  UNIQUE KEY uq_mailbox_access_request (provision_request_id),
  KEY idx_mailbox_access_status (status, created_at),
  CONSTRAINT fk_mailbox_access_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_mailbox_access_reviewer FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mailbox_send_logs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  mailbox_address VARCHAR(120) NOT NULL,
  recipient_email VARCHAR(254) NOT NULL,
  subject VARCHAR(120) NOT NULL,
  status ENUM('sending','accepted','failed','uncertain') NOT NULL DEFAULT 'sending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_mailbox_send_user_day (user_id, created_at),
  CONSTRAINT fk_mailbox_send_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
