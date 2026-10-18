-- Existing summaries have unknown provenance; do not label them as AI-generated.
ALTER TABLE posts ADD COLUMN summary_mode ENUM('', 'manual', 'ai') NOT NULL DEFAULT '' AFTER summary;
