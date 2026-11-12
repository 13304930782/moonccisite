CREATE TABLE IF NOT EXISTS daily_questions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  question_date DATE NOT NULL UNIQUE,
  text VARCHAR(40) NOT NULL,
  choices JSON NULL,
  status ENUM('draft','published','closed') NOT NULL DEFAULT 'draft',
  summary TEXT NULL,
  summary_status ENUM('none','pending','approved','rejected') NOT NULL DEFAULT 'none',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS daily_answers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  question_id BIGINT UNSIGNED NOT NULL,
  choice_index TINYINT UNSIGNED NULL,
  text VARCHAR(80) NULL,
  dedupe_key VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_daily_answer (question_id, dedupe_key),
  CONSTRAINT fk_daily_answer_question FOREIGN KEY (question_id) REFERENCES daily_questions(id) ON DELETE CASCADE,
  CONSTRAINT chk_daily_answer_value CHECK ((choice_index IS NULL) <> (text IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
