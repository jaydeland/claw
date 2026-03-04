-- Create WhatsApp bridges table for bidirectional chat bridging
CREATE TABLE whatsapp_bridges (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sub_chat_id TEXT NOT NULL REFERENCES sub_chats(id) ON DELETE CASCADE,
  whatsapp_jid TEXT NOT NULL,
  whatsapp_group_name TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- Indexes for common query patterns
CREATE INDEX whatsapp_bridges_chat_id_idx ON whatsapp_bridges(chat_id);
CREATE INDEX whatsapp_bridges_sub_chat_id_idx ON whatsapp_bridges(sub_chat_id);
CREATE INDEX whatsapp_bridges_jid_idx ON whatsapp_bridges(whatsapp_jid);
CREATE INDEX whatsapp_bridges_unique_idx ON whatsapp_bridges(chat_id, whatsapp_jid);
