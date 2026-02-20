-- Add is_transient column to chats table for transient mini-conversations
-- Using separate statements with error handling for idempotency
ALTER TABLE chats ADD COLUMN is_transient integer DEFAULT 0;
--> statement-breakpoint
-- Create index for efficient cleanup queries
CREATE INDEX IF NOT EXISTS chats_is_transient_idx ON chats(is_transient);
