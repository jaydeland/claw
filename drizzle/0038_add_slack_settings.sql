-- Migration: Add Slack settings table
-- This migration adds support for Slack Socket Mode integration

CREATE TABLE IF NOT EXISTS "slack_settings" (
    "id" text PRIMARY KEY DEFAULT 'default',
    "encrypted_app_token" text,
    "encrypted_bot_token" text,
    "is_socket_mode_enabled" integer DEFAULT false,
    "updated_at" integer DEFAULT (strftime('%s', 'now') * 1000)
);
