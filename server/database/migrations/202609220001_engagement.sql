CREATE TABLE IF NOT EXISTS engagement_preferences (
 user_id INT NOT NULL PRIMARY KEY,
 comment_email TINYINT NOT NULL DEFAULT 0,
 reply_email TINYINT NOT NULL DEFAULT 0,
 history_enabled TINYINT NOT NULL DEFAULT 1,
 history_epoch BIGINT NOT NULL DEFAULT 1,
 verified_email VARCHAR(120) NOT NULL DEFAULT '',
 verify_hash CHAR(64) NOT NULL DEFAULT '',
 verify_expires BIGINT NOT NULL DEFAULT 0,
 verify_sent BIGINT NOT NULL DEFAULT 0,
 verify_attempts INT NOT NULL DEFAULT 0,
 unsubscribe_token CHAR(64) NOT NULL,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS account_notifications (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id INT NOT NULL,
 event_key VARCHAR(160) CHARACTER SET ascii NOT NULL,
 kind VARCHAR(24) NOT NULL,
 post_id INT NULL,
 comment_id INT NULL,
 draft_id VARCHAR(36) NULL,
 message VARCHAR(1000) NOT NULL DEFAULT '',
 is_read TINYINT NOT NULL DEFAULT 0,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY recipient_event(user_id,event_key),
 KEY recipient_order(user_id,id),
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS notification_mail_jobs (
 notification_id BIGINT UNSIGNED PRIMARY KEY,
 state VARCHAR(16) NOT NULL DEFAULT 'pending',
 attempts INT NOT NULL DEFAULT 0,
 available_at BIGINT NOT NULL DEFAULT 0,
 locked_at BIGINT NOT NULL DEFAULT 0,
 lock_token CHAR(36) NOT NULL DEFAULT '',
 last_error VARCHAR(200) NOT NULL DEFAULT '',
 KEY mail_due(state,available_at),
 FOREIGN KEY (notification_id) REFERENCES account_notifications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS article_reading_history (
 user_id INT NOT NULL,
 post_id INT NOT NULL,
 anchor VARCHAR(200) NOT NULL DEFAULT '',
 progress DOUBLE NOT NULL DEFAULT 0,
 revision BIGINT NOT NULL DEFAULT 1,
 updated_at BIGINT NOT NULL,
 PRIMARY KEY(user_id,post_id),
 KEY history_recent(user_id,updated_at),
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS bookmark_folders (
 id INT AUTO_INCREMENT PRIMARY KEY,
 user_id INT NOT NULL,
 name VARCHAR(60) NOT NULL,
 UNIQUE KEY folder_name(user_id,name),
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS bookmark_folder_members (
 bookmark_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
 folder_id INT NOT NULL,
 FOREIGN KEY (bookmark_id) REFERENCES article_bookmarks(id) ON DELETE CASCADE,
 FOREIGN KEY (folder_id) REFERENCES bookmark_folders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS engagement_workflow_cycles (
 draft_id CHAR(36) NOT NULL PRIMARY KEY,
 cycle BIGINT NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
