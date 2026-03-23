-- Migration: Remove claws tables - Step 5: Drop discord_bridges table
-- Bridge functionality moved to chats table connection fields

DROP TABLE IF EXISTS discord_bridges;
