-- Migration: Add Slack and WhatsApp settings tables, update trigger_type enum
-- This migration adds support for Slack Socket Mode and WhatsApp Web integration

-- Create Slack settings table
CREATE TABLE IF NOT EXISTS "slack_settings" (
    "id" text PRIMARY KEY DEFAULT 'default',
    "encrypted_app_token" text,
    "encrypted_bot_token" text,
    "is_socket_mode_enabled" integer DEFAULT false,
    "updated_at" integer DEFAULT (strftime('%s', 'now') * 1000)
);

-- Create WhatsApp settings table
CREATE TABLE IF NOT EXISTS "whatsapp_settings" (
    "id" text PRIMARY KEY DEFAULT 'default',
    "is_connected" integer DEFAULT false,
    "session_path" text DEFAULT 'baileys_auth',
    "updated_at" integer DEFAULT (strftime('%s', 'now') * 1000)
);

-- Note: The trigger_type enum in headless_claws table is updated in application code
-- The existing column will accept the new values "slack_mention" and "whatsapp_message"
-- SQLite doesn't enforce enum constraints, so no ALTER TABLE is needed
