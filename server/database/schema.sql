-- mooncci current database schema.
-- Generated from production structure only, without table data.
-- Regenerate after database migrations.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `banned_words`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `banned_words` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `word` varchar(100) NOT NULL,
  `action` enum('block','replace') NOT NULL DEFAULT 'block',
  `replacement` varchar(100) DEFAULT '***',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `word` (`word`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `comment_likes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `comment_likes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `comment_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_comment_user` (`comment_id`,`user_id`),
  KEY `idx_comment_id` (`comment_id`),
  KEY `idx_user_id` (`user_id`),
  CONSTRAINT `fk_comment_likes_comment` FOREIGN KEY (`comment_id`) REFERENCES `comments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_comment_likes_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `comments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `comments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `post_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `parent_id` int(11) DEFAULT NULL,
  `reply_to_user_id` int(11) DEFAULT NULL,
  `content` text NOT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `ip_location` varchar(255) DEFAULT NULL,
  `user_agent` varchar(500) DEFAULT NULL,
  `status` enum('pending','visible','hidden','deleted','rejected') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_comments_post` (`post_id`),
  KEY `fk_comments_user` (`user_id`),
  CONSTRAINT `fk_comments_post` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_comments_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `custom_mail_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `custom_mail_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `sender_id` int(11) NOT NULL,
  `recipient_user_id` int(11) DEFAULT NULL,
  `recipient_email` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subject` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('sent','failed') COLLATE utf8mb4_unicode_ci NOT NULL,
  `error_message` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_custom_mail_logs_sender_created` (`sender_id`,`created_at`),
  KEY `idx_custom_mail_logs_recipient_created` (`recipient_email`,`created_at`),
  KEY `fk_custom_mail_logs_recipient_user` (`recipient_user_id`),
  CONSTRAINT `fk_custom_mail_logs_recipient_user` FOREIGN KEY (`recipient_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_custom_mail_logs_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `editor_applications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `editor_applications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `reason` text NOT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `reviewer_id` int(11) DEFAULT NULL,
  `review_note` text,
  `reviewed_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_editor_app_user` (`user_id`),
  KEY `fk_editor_app_reviewer` (`reviewer_id`),
  CONSTRAINT `fk_editor_app_reviewer` FOREIGN KEY (`reviewer_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_editor_app_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `early_access_applications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `early_access_applications` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email_normalized` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `occupation` enum('student','teacher','developer','creator','enterprise','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `use_case` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `device` enum('macbook','imac','mac_mini','mac_studio') COLLATE utf8mb4_unicode_ci NOT NULL,
  `macos_version` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `desired_features` json NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('pending','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `reviewer_id` int DEFAULT NULL,
  `review_note` text COLLATE utf8mb4_unicode_ci,
  `reviewed_at` datetime DEFAULT NULL,
  `owner_notification_sent_at` datetime DEFAULT NULL,
  `owner_notification_error` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `approval_email_sent_at` datetime DEFAULT NULL,
  `approval_email_error` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_early_access_email` (`email_normalized`),
  KEY `idx_early_access_status_created` (`status`,`created_at`),
  KEY `idx_early_access_reviewer` (`reviewer_id`),
  CONSTRAINT `fk_early_access_reviewer` FOREIGN KEY (`reviewer_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `electricity_snapshots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `electricity_snapshots` (
  `scope_key` char(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `snapshot_date` date NOT NULL,
  `recorded_at` datetime NOT NULL,
  `room_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `meter_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `device_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `meter_status` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `today_use` decimal(12,3) DEFAULT NULL,
  `purchased_remaining` decimal(12,3) DEFAULT NULL,
  `subsidy_remaining` decimal(12,3) DEFAULT NULL,
  `total_remaining` decimal(12,3) DEFAULT NULL,
  `price` decimal(12,4) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_electricity_snapshot_scope_date` (`scope_key`,`snapshot_date`),
  KEY `idx_electricity_recorded_at` (`recorded_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `electricity_monitor_state`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `electricity_monitor_state` (
  `id` tinyint unsigned NOT NULL,
  `low_alert_active` tinyint(1) NOT NULL DEFAULT '0',
  `last_low_alert_at` datetime DEFAULT NULL,
  `last_recovered_at` datetime DEFAULT NULL,
  `last_daily_email_date` date DEFAULT NULL,
  `last_daily_email_slot` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_success_at` datetime DEFAULT NULL,
  `last_error_at` datetime DEFAULT NULL,
  `last_error_code` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `password_resets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `password_resets` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `token_hash` varchar(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_token_hash` (`token_hash`),
  KEY `idx_user_id` (`user_id`),
  CONSTRAINT `fk_password_resets_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `posts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `posts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `slug` varchar(255) NOT NULL,
  `summary` text,
  `content` longtext NOT NULL,
  `cover_image` varchar(500) DEFAULT NULL,
  `category` varchar(100) DEFAULT NULL,
  `tags` json DEFAULT NULL,
  `status` enum('draft','published') NOT NULL DEFAULT 'draft',
  `author_id` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `version` int NOT NULL DEFAULT 1,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `published_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`),
  KEY `fk_posts_author` (`author_id`),
  CONSTRAINT `fk_posts_author` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `site_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `site_settings` (
  `setting_key` varchar(100) NOT NULL,
  `setting_value` longtext NOT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL,
  `email` varchar(120) NOT NULL,
  `google_sub` varchar(255) DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('owner','admin','editor','user') NOT NULL DEFAULT 'user',
  `status` enum('active','disabled') NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `can_comment` tinyint(1) NOT NULL DEFAULT '1',
  `login_attempts` int(11) NOT NULL DEFAULT '0',
  `locked_until` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `uniq_users_google_sub` (`google_sub`),
  KEY `idx_users_locked_until` (`locked_until`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

SET FOREIGN_KEY_CHECKS = 1;

-- Content platform: additive schema, no real content.
CREATE TABLE IF NOT EXISTS updates (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  content TEXT NOT NULL,
  image_url VARCHAR(500) NOT NULL DEFAULT '',
  status ENUM('draft','published') NOT NULL DEFAULT 'draft',
  author_id INT NOT NULL,
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX updates_public (status, published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS projects (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(160) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  summary TEXT NOT NULL,
  content TEXT NOT NULL,
  cover_image VARCHAR(500) NOT NULL DEFAULT '',
  tech_stack TEXT NOT NULL,
  stage ENUM('building','active','maintenance','archived') NOT NULL DEFAULT 'building',
  status ENUM('draft','published') NOT NULL DEFAULT 'draft',
  demo_url VARCHAR(500) NOT NULL DEFAULT '',
  repo VARCHAR(200) NOT NULL DEFAULT '',
  featured_rank INT NULL,
  sync_enabled TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX projects_public (status, featured_rank)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_releases (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  repo VARCHAR(200) NOT NULL,
  github_id BIGINT NOT NULL,
  title VARCHAR(255) NOT NULL,
  content MEDIUMTEXT NOT NULL,
  url VARCHAR(500) NOT NULL,
  published_at DATETIME NOT NULL,
  hidden TINYINT(1) NOT NULL DEFAULT 0,
  source_visible TINYINT(1) NOT NULL DEFAULT 1,
  historical TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY release_identity (project_id, repo, github_id),
  INDEX release_public (published_at, hidden),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS github_sync_state (
  project_id INT NOT NULL PRIMARY KEY,
  repo VARCHAR(200) NOT NULL,
  etag VARCHAR(255) NULL,
  initialized TINYINT(1) NOT NULL DEFAULT 0,
  baseline_at DATETIME NULL,
  last_success_at DATETIME NULL,
  next_attempt_at DATETIME NULL,
  error VARCHAR(255) NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS site_now (
  id TINYINT NOT NULL PRIMARY KEY,
  content TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS subscribers (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  status ENUM('pending','active','unsubscribed') NOT NULL DEFAULT 'pending',
  confirm_hash CHAR(64) NULL,
  confirm_expires DATETIME NULL,
  last_confirmation_at DATETIME NULL,
  confirmed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY confirm_token (confirm_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS newsletter_settings (
  id TINYINT NOT NULL PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO newsletter_settings (id, enabled) VALUES (1, 0);

CREATE TABLE IF NOT EXISTS newsletter_deliveries (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  subscriber_id INT NOT NULL,
  week_start DATE NOT NULL,
  status ENUM('pending','sending','sent','failed','uncertain','skipped') NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at DATETIME NULL,
  error VARCHAR(255) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY subscriber_week (subscriber_id, week_start),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS newsletter_tokens (
 token_hash CHAR(64) NOT NULL PRIMARY KEY,
 subscriber_id INT NOT NULL,
 expires_at DATETIME NOT NULL,
 INDEX token_expiry (expires_at),
 FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Media library is included in the fresh-install snapshot.
CREATE TABLE IF NOT EXISTS `media_assets` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `filename` varchar(255) NOT NULL,
  `original_name` varchar(255) DEFAULT '',
  `display_name` varchar(255) DEFAULT '',
  `alt_text` varchar(255) DEFAULT '',
  `url` varchar(500) NOT NULL,
  `mime` varchar(100) DEFAULT '',
  `ext` varchar(20) DEFAULT '',
  `size` int(11) DEFAULT 0,
  `width` int(11) DEFAULT NULL,
  `height` int(11) DEFAULT NULL,
  `quality` varchar(20) DEFAULT '',
  `status` enum('active','trashed') NOT NULL DEFAULT 'active',
  `uploaded_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_media_filename` (`filename`),
  KEY `idx_media_status` (`status`),
  KEY `idx_media_uploaded_by` (`uploaded_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS electricity_reports (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  scope_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  report_date DATE NOT NULL,
  period ENUM('morning','evening') NOT NULL,
  published_at DATETIME(3) NOT NULL COMMENT 'UTC',
  payload JSON NOT NULL,
  UNIQUE KEY uniq_electricity_report_slot (scope_key, report_date, period),
  KEY idx_electricity_report_feed (scope_key, published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS electricity_rss_subscriptions (
  user_id INT NOT NULL,
  scope_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  token_encrypted VARCHAR(512) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, scope_key),
  UNIQUE KEY uniq_electricity_rss_token (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- Complete-day usage and actual cumulative readings (202609070001)
CREATE TABLE IF NOT EXISTS electricity_midnight_snapshots (
  scope_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  boundary_date DATE NOT NULL,
  payload JSON NOT NULL,
  PRIMARY KEY (scope_key, boundary_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS electricity_daily_usage (
  scope_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  usage_date DATE NOT NULL,
  payload JSON NOT NULL,
  PRIMARY KEY (scope_key, usage_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE electricity_snapshots
  ADD COLUMN cumulative_reading DECIMAL(18,6) DEFAULT NULL COMMENT 'Actual upstream meter reading, kWh, never synthesized',
  ADD COLUMN cumulative_reading_source VARCHAR(80) DEFAULT NULL;

-- Weather companion interactions (202609080001)
CREATE TABLE IF NOT EXISTS weather_companion_interactions (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  interaction_date DATE NOT NULL COMMENT 'Asia/Shanghai business date',
  kind ENUM('pet', 'hit') NOT NULL,
  created_at DATETIME(3) NOT NULL COMMENT 'UTC',
  KEY idx_companion_daily (interaction_date, kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Multi-room electricity: credentials encrypted using the server-only key.
CREATE TABLE IF NOT EXISTS electricity_rooms (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 scope_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 name VARCHAR(100) NOT NULL,
 credentials_encrypted TEXT NOT NULL,
 credential_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 meter_identity CHAR(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL UNIQUE,
 config JSON NOT NULL,
 legacy TINYINT NOT NULL DEFAULT 0,
 active TINYINT NOT NULL DEFAULT 1,
 verified_at DATETIME DEFAULT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS electricity_room_members (
 room_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 user_id INT NOT NULL,
 PRIMARY KEY(room_id,user_id),
 FOREIGN KEY(room_id) REFERENCES electricity_rooms(id) ON DELETE CASCADE,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS electricity_room_state (
 scope_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 low_alert_active TINYINT NOT NULL DEFAULT 0,
 last_low_alert_at DATETIME DEFAULT NULL,
 last_recovered_at DATETIME DEFAULT NULL,
 last_daily_email_date DATE DEFAULT NULL,
 last_daily_email_slot VARCHAR(16) DEFAULT NULL,
 last_success_at DATETIME DEFAULT NULL,
 last_error_at DATETIME DEFAULT NULL,
 last_error_code VARCHAR(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS electricity_room_runs (
 scope_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 run_date DATE NOT NULL,
 run_hour TINYINT UNSIGNED NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'running',
 attempts TINYINT UNSIGNED NOT NULL DEFAULT 1,
 started_at DATETIME NOT NULL,
 error_code VARCHAR(100) DEFAULT NULL,
 PRIMARY KEY(scope_key,run_date,run_hour)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auth_revocations (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  expires_at BIGINT NOT NULL,
  KEY idx_auth_revocations_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auth_invalidations (
  user_id INT NOT NULL PRIMARY KEY,
  invalid_before BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE comments
  MODIFY post_id INT NULL,
  ADD COLUMN update_id INT NULL AFTER post_id,
  ADD INDEX idx_comments_update (update_id),
  ADD CONSTRAINT fk_comments_update FOREIGN KEY (update_id) REFERENCES updates(id) ON DELETE CASCADE;

-- Third-party login management (2026-09-10)
CREATE TABLE IF NOT EXISTS oauth_providers (
  provider VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  enabled TINYINT NOT NULL DEFAULT 0,
  client_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
  secret_cipher TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS oauth_identities (
  provider VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  client_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  subject VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (provider, client_id, subject),
  UNIQUE KEY uniq_oauth_user (user_id, provider, client_id),
  CONSTRAINT fk_oauth_identity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash CHAR(64) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  browser_hash CHAR(64) CHARACTER SET ascii NOT NULL,
  provider VARCHAR(16) CHARACTER SET ascii NOT NULL,
  config_version INT NOT NULL,
  client_id VARCHAR(255) CHARACTER SET ascii NOT NULL,
  verifier VARCHAR(128) CHARACTER SET ascii NOT NULL,
  user_id INT NULL,
  session_hash CHAR(64) CHARACTER SET ascii NULL,
  started_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  return_to VARCHAR(200) NOT NULL,
  KEY idx_oauth_states_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS oauth_registrations (
  token_hash CHAR(64) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  provider VARCHAR(16) CHARACTER SET ascii NOT NULL,
  client_id VARCHAR(255) CHARACTER SET ascii NOT NULL,
  config_version INT NOT NULL,
  subject VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  display_name VARCHAR(80) NOT NULL,
  started_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  return_to VARCHAR(200) NOT NULL,
  email VARCHAR(120) NOT NULL DEFAULT '',
  code_hash CHAR(64) CHARACTER SET ascii NOT NULL DEFAULT '',
  code_expires_at BIGINT NOT NULL DEFAULT 0,
  sent_at BIGINT NOT NULL DEFAULT 0,
  attempts INT NOT NULL DEFAULT 0,
  KEY idx_oauth_registration_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS account_profiles (
  user_id INT NOT NULL PRIMARY KEY,
  avatar_url VARCHAR(255) NOT NULL DEFAULT '',
  deleted_at DATETIME NULL,
  version INT NOT NULL DEFAULT 1,
  CONSTRAINT fk_account_profile_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS account_challenges (
  id CHAR(64) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  session_hash CHAR(64) CHARACTER SET ascii NOT NULL,
  purpose VARCHAR(16) CHARACTER SET ascii NOT NULL,
  old_email VARCHAR(120) NOT NULL,
  new_email VARCHAR(120) NOT NULL DEFAULT '',
  old_code_hash CHAR(64) CHARACTER SET ascii NOT NULL,
  new_code_hash CHAR(64) CHARACTER SET ascii NOT NULL DEFAULT '',
  attempts INT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  INDEX idx_account_challenge_user(user_id,purpose,created_at),
  CONSTRAINT fk_account_challenge_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
