ALTER TABLE `users`
  ADD COLUMN `google_sub` varchar(255) DEFAULT NULL AFTER `email`,
  ADD UNIQUE KEY `uniq_users_google_sub` (`google_sub`);
