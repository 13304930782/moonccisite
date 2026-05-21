CREATE TABLE IF NOT EXISTS custom_mail_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sender_id INT NOT NULL,
  recipient_user_id INT NULL,
  recipient_email VARCHAR(120) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  status ENUM('sent', 'failed') NOT NULL,
  error_message VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_custom_mail_logs_sender_created (sender_id, created_at),
  INDEX idx_custom_mail_logs_recipient_created (recipient_email, created_at),
  CONSTRAINT fk_custom_mail_logs_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_custom_mail_logs_recipient_user FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
