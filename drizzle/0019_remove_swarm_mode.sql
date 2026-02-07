-- Update any existing chats using swarm mode to agent mode
UPDATE sub_chats SET mode = 'agent' WHERE mode = 'swarm';
