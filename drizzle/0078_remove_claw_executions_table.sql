-- Migration: Remove claws tables - Step 2: Drop claw_executions table
-- This removes the execution history tracking

DROP TABLE IF EXISTS claw_executions;
