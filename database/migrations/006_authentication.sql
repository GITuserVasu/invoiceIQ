-- Migration 006: Password authentication support

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS password_hash text;

CREATE INDEX IF NOT EXISTS app_users_status_email_idx
  ON app_users (status, lower(email));
