import { Pool } from 'pg';
import { getConfig } from '../config.js';

export interface LocalChat {
  id: string;
  created_at: Date;
  user_id?: string;
  metadata: Record<string, any>;
  cloud_synced: boolean;
}

export interface LocalMessage {
  id: string;
  chat_id: string;
  role: string;
  content: string;
  created_at: Date;
  metadata: Record<string, any>;
  cloud_synced: boolean;
}

export interface MessageEmbedding {
  message_id: string;
  embedding: number[];
  created_at: Date;
}

export class LocalDatabase {
  public pool: Pool;

  constructor() {
    const config = getConfig();
    this.pool = new Pool({
      connectionString: config.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
    });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // Chat operations
  async createChat(chat: Omit<LocalChat, 'created_at' | 'cloud_synced'>): Promise<LocalChat> {
    const query = `
      INSERT INTO chats_local (id, user_id, metadata, cloud_synced)
      VALUES ($1, $2, $3, false)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      chat.id,
      chat.user_id,
      JSON.stringify(chat.metadata)
    ]);

    return this.mapChatRow(result.rows[0]);
  }

  async getChat(chatId: string): Promise<LocalChat | null> {
    const query = 'SELECT * FROM chats_local WHERE id = $1';
    const result = await this.pool.query(query, [chatId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapChatRow(result.rows[0]);
  }

  async listRecentChats(userId?: string, limit: number = 10): Promise<LocalChat[]> {
    let query = 'SELECT * FROM chats_local';
    const params: any[] = [];

    if (userId) {
      query += ' WHERE user_id = $1';
      params.push(userId);
    }

    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);

    const result = await this.pool.query(query, params);
    return result.rows.map(row => this.mapChatRow(row));
  }

  async getUnsyncedChats(): Promise<LocalChat[]> {
    const query = 'SELECT * FROM chats_local WHERE cloud_synced = false';
    const result = await this.pool.query(query);
    return result.rows.map(row => this.mapChatRow(row));
  }

  async markChatSynced(chatId: string): Promise<void> {
    const query = 'UPDATE chats_local SET cloud_synced = true WHERE id = $1';
    await this.pool.query(query, [chatId]);
  }

  // Message operations
  async appendMessages(chatId: string, messages: Omit<LocalMessage, 'chat_id' | 'created_at' | 'cloud_synced'>[]): Promise<LocalMessage[]> {
    const values: any[] = [];
    const placeholders: string[] = [];

    messages.forEach((message, index) => {
      const offset = index * 5;
      placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`);
      values.push(
        message.id,
        chatId,
        message.role,
        message.content,
        JSON.stringify(message.metadata),
        false
      );
    });

    const query = `
      INSERT INTO messages_local (id, chat_id, role, content, metadata, cloud_synced)
      VALUES ${placeholders.join(', ')}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    return result.rows.map(row => this.mapMessageRow(row));
  }

  async getChatMessages(chatId: string): Promise<LocalMessage[]> {
    const query = 'SELECT * FROM messages_local WHERE chat_id = $1 ORDER BY created_at';
    const result = await this.pool.query(query, [chatId]);
    return result.rows.map(row => this.mapMessageRow(row));
  }

  async getUnsyncedMessages(): Promise<LocalMessage[]> {
    const query = 'SELECT * FROM messages_local WHERE cloud_synced = false ORDER BY created_at';
    const result = await this.pool.query(query);
    return result.rows.map(row => this.mapMessageRow(row));
  }

  async markMessagesSynced(messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) return;

    const placeholders = messageIds.map((_, index) => `$${index + 1}`).join(', ');
    const query = `UPDATE messages_local SET cloud_synced = true WHERE id IN (${placeholders})`;
    await this.pool.query(query, messageIds);
  }

  // Embedding operations
  async storeMessageEmbedding(messageId: string, embedding: number[]): Promise<void> {
    const query = `
      INSERT INTO message_embeddings_local (message_id, embedding)
      VALUES ($1, $2)
      ON CONFLICT (message_id) DO UPDATE SET
        embedding = EXCLUDED.embedding,
        created_at = NOW()
    `;

    await this.pool.query(query, [messageId, JSON.stringify(embedding)]);
  }

  async getMessageEmbedding(messageId: string): Promise<number[] | null> {
    const query = 'SELECT embedding FROM message_embeddings_local WHERE message_id = $1';
    const result = await this.pool.query(query, [messageId]);

    if (result.rows.length === 0) {
      return null;
    }

    return JSON.parse(result.rows[0].embedding);
  }

  // Sync error logging
  async logSyncError(entityType: string, entityId: string, error: string): Promise<void> {
    const query = `
      INSERT INTO sync_errors (entity_type, entity_id, error)
      VALUES ($1, $2, $3)
    `;

    await this.pool.query(query, [entityType, entityId, error]);
  }

  // Helper methods
  private mapChatRow(row: any): LocalChat {
    return {
      id: row.id,
      created_at: new Date(row.created_at),
      user_id: row.user_id,
      metadata: JSON.parse(row.metadata || '{}'),
      cloud_synced: row.cloud_synced
    };
  }

  private mapMessageRow(row: any): LocalMessage {
    return {
      id: row.id,
      chat_id: row.chat_id,
      role: row.role,
      content: row.content,
      created_at: new Date(row.created_at),
      metadata: JSON.parse(row.metadata || '{}'),
      cloud_synced: row.cloud_synced
    };
  }
}

// Global instance
let dbInstance: LocalDatabase | null = null;

export function getDatabase(): LocalDatabase {
  if (!dbInstance) {
    dbInstance = new LocalDatabase();
  }
  return dbInstance;
}

export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}
