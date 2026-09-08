ALTER TABLE electricity_monitor_state
  ADD COLUMN last_daily_email_slot VARCHAR(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL
  AFTER last_daily_email_date;
