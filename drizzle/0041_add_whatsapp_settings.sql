-- Migration: Add WhatsApp settings table
-- This migration adds support for WhatsApp Web integration

CREATE TABLE IF NOT EXISTS "whatsapp_settings" (
    "id" text PRIMARY KEY DEFAULT 'default',
    "is_connected" integer DEFAULT false,
    "session_path" text DEFAULT 'baileys_auth',
    "updated_at" integer DEFAULT (strftime('%s', 'now') * 1000)
);
