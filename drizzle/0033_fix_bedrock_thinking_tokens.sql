-- Fix max_thinking_tokens default for Bedrock compatibility
-- Bedrock models have a 200,000 total output token limit
-- The previous default of 1,000,000 thinking tokens exceeded this limit
-- causing "API Error: 400 The maximum tokens you requested exceeds the model limit"

UPDATE claude_code_settings
SET max_thinking_tokens = 100000
WHERE id = 'default'
  AND max_thinking_tokens > 200000;

-- Clear all existing session IDs to force fresh starts with correct token limits
-- Sessions created with old token limits will fail on server with "No conversation found"
UPDATE sub_chats
SET session_id = NULL
WHERE session_id IS NOT NULL;
