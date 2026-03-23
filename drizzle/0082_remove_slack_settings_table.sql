-- Migration: Remove claws tables - Step 6: Drop slack_settings table
-- Slack support removed, using WhatsApp and Discord only

DROP TABLE IF EXISTS slack_settings;
