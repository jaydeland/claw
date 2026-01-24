-- Migration: Remove Devyard References
-- Updates any rows with auth_mode='devyard' to 'oauth' (personal mode)

UPDATE claude_code_settings
SET auth_mode = 'oauth'
WHERE auth_mode = 'devyard';
