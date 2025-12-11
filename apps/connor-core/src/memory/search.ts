import { OpenAI } from 'openai';
import { getConfig } from '../config.js';
import { getDatabase, LocalDatabase } from './localDb.js';
import { getCloudSync } from './cloudSync.js';

export interface SearchResult {
  message: {
    id: string;
    chat_id: string;
    role: string;
    content: string;
    created_at: Date;
    metadata: Record<string, any>;
  };
  chat: {
    id: string;
    user_id?: string;
    metadata: Record<string, any>;
  };
  score: number;
  source: 'local' | 'cloud';
}

export class MemorySearch {
  private config = getConfig();
  private db = getDatabase();
  private cloudSync = getCloudSync();
  private openai?: OpenAI;

  constructor() {
    if (this.config.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: this.config.OPENAI_API_KEY
      });
    }
  }

  /**
   * Generate embedding for text using OpenAI (when online)
   */
  private async generateEmbedding(text: string): Promise<number[] | null> {
    if (!this.openai) {
      return null;
    }

    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
        encoding_format: 'float',
      });

      return response.data[0].embedding;
    } catch (error) {
      console.warn('Failed to generate embedding:', error.message);
      return null;
    }
  }

  /**
   * Search local memory using pgvector
   */
  private async searchLocalMemory(query: string, topK: number = 10): Promise<SearchResult[]> {
    const queryEmbedding = await this.generateEmbedding(query);

    if (!queryEmbedding) {
      // Fallback to keyword search
      return this.keywordSearchLocal(query, topK);
    }

    // Store query embedding temporarily for search
    const queryVector = `[${queryEmbedding.join(',')}]`;

    const sqlQuery = `
      SELECT
        m.id,
        m.chat_id,
        m.role,
        m.content,
        m.created_at,
        m.metadata,
        c.user_id as chat_user_id,
        c.metadata as chat_metadata,
        1 - (mel.embedding <=> $1::vector) as score
      FROM messages_local m
      JOIN chats_local c ON m.chat_id = c.id
      JOIN message_embeddings_local mel ON m.id = mel.message_id
      ORDER BY mel.embedding <=> $1::vector
      LIMIT $2
    `;

    try {
      const result = await this.db.pool.query(sqlQuery, [queryVector, topK]);

      return result.rows.map(row => ({
        message: {
          id: row.id,
          chat_id: row.chat_id,
          role: row.role,
          content: row.content,
          created_at: new Date(row.created_at),
          metadata: JSON.parse(row.metadata || '{}')
        },
        chat: {
          id: row.chat_id,
          user_id: row.chat_user_id,
          metadata: JSON.parse(row.chat_metadata || '{}')
        },
        score: parseFloat(row.score),
        source: 'local' as const
      }));
    } catch (error) {
      console.warn('Local vector search failed, falling back to keyword search:', error.message);
      return this.keywordSearchLocal(query, topK);
    }
  }

  /**
   * Fallback keyword search when embeddings aren't available
   */
  private async keywordSearchLocal(query: string, topK: number = 10): Promise<SearchResult[]> {
    const sqlQuery = `
      SELECT
        m.id,
        m.chat_id,
        m.role,
        m.content,
        m.created_at,
        m.metadata,
        c.user_id as chat_user_id,
        c.metadata as chat_metadata,
        ts_rank_cd(to_tsvector('english', m.content), plainto_tsquery('english', $1)) as score
      FROM messages_local m
      JOIN chats_local c ON m.chat_id = c.id
      WHERE to_tsvector('english', m.content) @@ plainto_tsquery('english', $1)
      ORDER BY score DESC
      LIMIT $2
    `;

    try {
      const result = await this.db.pool.query(sqlQuery, [query, topK]);

      return result.rows.map(row => ({
        message: {
          id: row.id,
          chat_id: row.chat_id,
          role: row.role,
          content: row.content,
          created_at: new Date(row.created_at),
          metadata: JSON.parse(row.metadata || '{}')
        },
        chat: {
          id: row.chat_id,
          user_id: row.chat_user_id,
          metadata: JSON.parse(row.chat_metadata || '{}')
        },
        score: parseFloat(row.score),
        source: 'local' as const
      }));
    } catch (error) {
      console.warn('Keyword search failed:', error.message);
      return [];
    }
  }

  /**
   * Search cloud memory
   */
  private async searchCloudMemory(query: string, topK: number = 10, filter?: { user_id?: string }): Promise<SearchResult[]> {
    const results = await this.cloudSync.searchCloudMemory(query, topK, filter);

    return results.map(result => ({
      message: result.message,
      chat: result.chat,
      score: result.score,
      source: 'cloud' as const
    }));
  }

  /**
   * Combined search across local and cloud memory
   */
  async searchMemory(
    query: string,
    options: {
      topK?: number;
      includeLocal?: boolean;
      includeCloud?: boolean;
      filter?: { user_id?: string };
    } = {}
  ): Promise<SearchResult[]> {
    const {
      topK = 10,
      includeLocal = true,
      includeCloud = true,
      filter
    } = options;

    const results: SearchResult[] = [];

    // Search local memory
    if (includeLocal) {
      const localResults = await this.searchLocalMemory(query, topK);
      results.push(...localResults);
    }

    // Search cloud memory (if online)
    if (includeCloud && await this.cloudSync.isOnline()) {
      const cloudResults = await this.searchCloudMemory(query, topK, filter);
      results.push(...cloudResults);
    }

    // Sort by score and deduplicate
    const seen = new Set<string>();
    return results
      .sort((a, b) => b.score - a.score)
      .filter(result => {
        const key = `${result.source}-${result.message.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, topK);
  }

  /**
   * Store message with embedding for future search
   */
  async storeMessageWithEmbedding(messageId: string, content: string): Promise<void> {
    const embedding = await this.generateEmbedding(content);

    if (embedding) {
      await this.db.storeMessageEmbedding(messageId, embedding);
    }
  }
}

// Global instance
let searchInstance: MemorySearch | null = null;

export function getMemorySearch(): MemorySearch {
  if (!searchInstance) {
    searchInstance = new MemorySearch();
  }
  return searchInstance;
}
