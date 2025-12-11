-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Local chats table (mirrors cloud schema)
CREATE TABLE IF NOT EXISTS chats_local (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id TEXT,
    metadata JSONB DEFAULT '{}',
    cloud_synced BOOLEAN DEFAULT FALSE
);

-- Local messages table
CREATE TABLE IF NOT EXISTS messages_local (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL REFERENCES chats_local(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    cloud_synced BOOLEAN DEFAULT FALSE
);

-- Local embeddings table
CREATE TABLE IF NOT EXISTS message_embeddings_local (
    message_id TEXT PRIMARY KEY REFERENCES messages_local(id) ON DELETE CASCADE,
    embedding VECTOR(768),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sync error logging (optional)
CREATE TABLE IF NOT EXISTS sync_errors (
    id SERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    error TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chats_local_user_id ON chats_local(user_id);
CREATE INDEX IF NOT EXISTS idx_chats_local_cloud_synced ON chats_local(cloud_synced);
CREATE INDEX IF NOT EXISTS idx_messages_local_chat_id ON messages_local(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_local_cloud_synced ON messages_local(cloud_synced);
CREATE INDEX IF NOT EXISTS idx_messages_local_created_at ON messages_local(created_at);
