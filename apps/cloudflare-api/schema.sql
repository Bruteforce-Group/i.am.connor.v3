-- D1 Database schema for Bozza Archive API

-- Chats table
CREATE TABLE chats (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    user_id TEXT,
    metadata TEXT
);

-- Messages table
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    metadata TEXT,
    FOREIGN KEY (chat_id) REFERENCES chats(id)
);

-- Indexes for performance
CREATE INDEX idx_chats_user_id ON chats(user_id);
CREATE INDEX idx_messages_chat_id ON messages(chat_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
