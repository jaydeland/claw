-- Migration: Remove claws tables - Step 3: Drop chat_sessions table
-- This removes the persistent session management for claws

DROP TABLE IF EXISTS chat_sessions;
