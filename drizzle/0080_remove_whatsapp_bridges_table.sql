-- Migration: Remove claws tables - Step 4: Drop whatsapp_bridges table
-- Bridge functionality moved to chats table connection fields

DROP TABLE IF EXISTS whatsapp_bridges;
