-- Add background model selection fields for each provider
ALTER TABLE claude_code_settings ADD COLUMN anthropic_background_model text DEFAULT 'haiku';
--> statement-breakpoint
ALTER TABLE claude_code_settings ADD COLUMN bedrock_background_model text;
--> statement-breakpoint
ALTER TABLE claude_code_settings ADD COLUMN ollama_background_model text;
--> statement-breakpoint
ALTER TABLE claude_code_settings ADD COLUMN custom_api_background_model text;
