import axios from 'axios';
import { getConfig } from '../config.js';
import { getDatabase, LocalChat, LocalMessage } from './localDb.js';

export interface CloudChatLog {
  chat_id: string;
  user_id?: string;
  metadata?: Record<string, any>;
  messages: Array<{
    id?: string;
    role: string;
    content: string;
    created_at?: string;
    metadata?: Record<string, any>;
  }>;
}

export class CloudSync {
  private config = getConfig();
  private db = getDatabase();

  /**
   * Check if we can reach cloud services
   */
  async isOnline(): Promise<boolean> {
    try {
      // Try to reach Cloudflare API health endpoint
      const response = await axios.get(`${this.config.CLOUDFLARE_API_BASE}/health`, {
        timeout: 5000
      });

      if (response.status !== 200) {
        return false;
      }

      // Optionally test OpenAI API
      if (this.config.OPENAI_API_KEY) {
        // Simple test - we could check models endpoint
        return true;
      }

      return true;
    } catch (error) {
      console.warn('Cloud connectivity check failed:', error.message);
      return false;
    }
  }

  /**
   * Sync unsynced local data to cloud
   */
  async syncToCloud(): Promise<{ success: boolean; syncedChats: number; syncedMessages: number; errors: string[] }> {
    const result = {
      success: false,
      syncedChats: 0,
      syncedMessages: 0,
      errors: [] as string[]
    };

    if (!(await this.isOnline())) {
      result.errors.push('Not online');
      return result;
    }

    try {
      // Get unsynced chats
      const unsyncedChats = await this.db.getUnsyncedChats();

      for (const chat of unsyncedChats) {
        try {
          // Get messages for this chat
          const messages = await this.db.getChatMessages(chat.id);

          // Prepare cloud log format
          const cloudLog: CloudChatLog = {
            chat_id: chat.id,
            user_id: chat.user_id,
            metadata: chat.metadata,
            messages: messages.map(msg => ({
              id: msg.id,
              role: msg.role,
              content: msg.content,
              created_at: msg.created_at.toISOString(),
              metadata: msg.metadata
            }))
          };

          // Send to cloud
          const response = await axios.post(`${this.config.CLOUDFLARE_API_BASE}/chat/log`, cloudLog, {
            timeout: 30000,
            headers: {
              'Content-Type': 'application/json'
            }
          });

          if (response.status === 200) {
            // Mark as synced
            await this.db.markChatSynced(chat.id);
            await this.db.markMessagesSynced(messages.map(m => m.id));

            result.syncedChats++;
            result.syncedMessages += messages.length;

            console.log(`Synced chat ${chat.id} with ${messages.length} messages`);
          } else {
            throw new Error(`Cloud API returned ${response.status}`);
          }

        } catch (error) {
          const errorMsg = `Failed to sync chat ${chat.id}: ${error.message}`;
          result.errors.push(errorMsg);
          await this.db.logSyncError('chat', chat.id, error.message);
        }
      }

      result.success = result.errors.length === 0;
      return result;

    } catch (error) {
      result.errors.push(`Sync process failed: ${error.message}`);
      return result;
    }
  }

  /**
   * Search cloud memory (when online)
   */
  async searchCloudMemory(query: string, topK: number = 10, filter?: { user_id?: string; project?: string }): Promise<any[]> {
    if (!(await this.isOnline())) {
      return [];
    }

    try {
      const response = await axios.post(`${this.config.CLOUDFLARE_API_BASE}/chat/search`, {
        query,
        top_k: topK,
        filter
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return response.data.results || [];
    } catch (error) {
      console.warn('Cloud search failed:', error.message);
      return [];
    }
  }

  /**
   * Fetch a specific chat from cloud
   */
  async fetchCloudChat(chatId: string): Promise<any | null> {
    if (!(await this.isOnline())) {
      return null;
    }

    try {
      const response = await axios.get(`${this.config.CLOUDFLARE_API_BASE}/chat/${chatId}`, {
        timeout: 10000
      });

      return response.data;
    } catch (error) {
      console.warn('Cloud fetch failed:', error.message);
      return null;
    }
  }

  /**
   * Start periodic sync (call this once at startup)
   */
  startPeriodicSync(intervalMs: number = 30000): () => void {
    const intervalId = setInterval(async () => {
      const result = await this.syncToCloud();
      if (result.syncedChats > 0 || result.syncedMessages > 0) {
        console.log(`Periodic sync: ${result.syncedChats} chats, ${result.syncedMessages} messages`);
      }
      if (result.errors.length > 0) {
        console.warn('Sync errors:', result.errors);
      }
    }, intervalMs);

    // Return cleanup function
    return () => clearInterval(intervalId);
  }
}

// Global instance
let syncInstance: CloudSync | null = null;

export function getCloudSync(): CloudSync {
  if (!syncInstance) {
    syncInstance = new CloudSync();
  }
  return syncInstance;
}
