ALTER TABLE `claw_executions` ADD COLUMN `sub_chat_id` text REFERENCES `sub_chats`(`id`);
