-- Fix token limits for Bedrock compatibility
-- Bedrock Sonnet 4.5 has a 64,000 total output token limit (not 200k!)
-- The previous defaults of 1,000,000 thinking + 200,000 MCP output exceeded this
-- causing "API Error: 400 The maximum tokens you requested exceeds the model limit"

UPDATE claude_code_settings
SET max_thinking_tokens = 50000,
    max_mcp_output_tokens = 64000
WHERE id = 'default';

-- Clear all existing session IDs to force fresh starts with correct token limits
-- Sessions created with old token limits will fail on server with "No conversation found"
UPDATE sub_chats
SET session_id = NULL
WHERE session_id IS NOT NULL;
