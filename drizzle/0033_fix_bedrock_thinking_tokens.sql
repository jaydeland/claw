-- Fix token limits for Bedrock compatibility
-- Bedrock Sonnet 4.5 has a 64,000 thinking token limit (separate from MCP output)
-- The previous defaults of 1,000,000 thinking tokens exceeded the model limit
-- causing "API Error: 400 The maximum tokens you requested exceeds the model limit of 64000"

-- Only update if settings have the old bad values (>=200000 thinking tokens)
-- This makes the migration idempotent - it won't overwrite user's manual changes
UPDATE claude_code_settings
SET max_thinking_tokens = 60000,
    max_mcp_output_tokens = 150000
WHERE id = 'default'
  AND max_thinking_tokens >= 200000; -- Only fix if still using old bad defaults

-- Clear all existing session IDs to force fresh starts with correct token limits
-- Sessions created with old token limits will fail on server with "No conversation found"
UPDATE sub_chats
SET session_id = NULL
WHERE session_id IS NOT NULL;
