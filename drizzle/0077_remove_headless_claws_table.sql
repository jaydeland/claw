-- Migration: Remove claws tables - Step 1: Drop headless_claws table
-- This removes the autonomous agent definitions

DROP TABLE IF EXISTS headless_claws;
