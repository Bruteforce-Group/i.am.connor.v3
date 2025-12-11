import { OpenAI } from 'openai';
import { getConfig, isOnlineFeaturesEnabled, isOfflineModeEnabled } from '../config.js';
import { getDatabase } from '../memory/localDb.js';
import { getMemorySearch } from '../memory/search.js';
import { getCloudSync } from '../memory/cloudSync.js';
import { getOllamaClient } from '../offline/ollamaClient.js';

export interface ConversationContext {
  chatId: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: Date;
  }>;
  userId?: string;
}

export class AgentBrain {
  private config = getConfig();
  private db = getDatabase();
  private memorySearch = getMemorySearch();
  private cloudSync = getCloudSync();
  private openai?: OpenAI;

  // System persona and behavior
  private readonly SYSTEM_PROMPT = `You are i.am.connor.v3, a helpful and witty AI assistant inspired by JARVIS from Iron Man.

Your capabilities:
- Voice conversations via Realtime API
- Computer control and automation
- Long-term memory across conversations
- Works online and offline

Personality traits:
- Helpful and proactive
- Slightly witty and sarcastic (but not over-the-top)
- Technically knowledgeable
- Remembers user preferences and context
- Acknowledges when you're using tools or searching memory

When using tools:
- Always explain what you're doing
- Be transparent about searching memory or using computer control
- If something fails, explain why and offer alternatives

Memory usage:
- Reference previous conversations when relevant
- Remember user preferences and recurring topics
- Use memory to provide personalized responses

Always maintain the persona of being a sophisticated AI assistant while being genuinely helpful.`;

  constructor() {
    if (this.config.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: this.config.OPENAI_API_KEY
      });
    }
  }

  /**
   * Process a user message and generate a response
   */
  async processMessage(
    userMessage: string,
    context: ConversationContext,
    options: {
      useMemory?: boolean;
      enableComputerUse?: boolean;
      forceOffline?: boolean;
    } = {}
  ): Promise<{
    response: string;
    toolUsed?: string;
    memoryUsed?: boolean;
    offlineMode?: boolean;
  }> {
    const { useMemory = true, enableComputerUse = false, forceOffline = false } = options;

    // Check online status
    const isOnline = !forceOffline && await this.cloudSync.isOnline();
    const useOfflineMode = forceOffline || (!isOnline && isOfflineModeEnabled());

    // Get relevant memory context
    let memoryContext = '';
    if (useMemory) {
      const memoryResults = await this.memorySearch.searchMemory(userMessage, {
        topK: 5,
        includeLocal: true,
        includeCloud: isOnline
      });

      if (memoryResults.length > 0) {
        memoryContext = '\n\nRelevant past conversations:\n' +
          memoryResults.slice(0, 3).map(result =>
            `- ${result.message.created_at.toISOString().split('T')[0]}: ${result.message.content.slice(0, 100)}...`
          ).join('\n');
      }
    }

    // Prepare conversation history
    const conversationHistory = context.messages.slice(-10); // Last 10 messages
    const fullPrompt = this.SYSTEM_PROMPT +
      (memoryContext ? memoryContext : '') +
      '\n\nCurrent conversation:\n' +
      conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n');

    // Try OpenAI first (if online and available)
    if (!useOfflineMode && this.openai) {
      try {
        const completion = await this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: fullPrompt },
            ...conversationHistory.map(msg => ({
              role: msg.role as 'user' | 'assistant' | 'system',
              content: msg.content
            })),
            { role: 'user', content: userMessage }
          ],
          max_tokens: 1000,
          temperature: 0.7
        });

        const response = completion.choices[0]?.message?.content || 'I apologize, but I couldn\'t generate a response.';

        return {
          response,
          memoryUsed: memoryContext.length > 0,
          offlineMode: false
        };

      } catch (error) {
        console.warn('OpenAI API failed, falling back to offline mode:', error.message);
        // Fall through to offline mode
      }
    }

    // Offline fallback
    if (useOfflineMode) {
      return await this.generateOfflineResponse(userMessage, conversationHistory, memoryContext);
    }

    // Complete failure
    return {
      response: 'I\'m currently unable to process your request. Please check your internet connection and API configuration.',
      offlineMode: true
    };
  }

  /**
   * Generate response using offline capabilities
   */
  private async generateOfflineResponse(
    userMessage: string,
    conversationHistory: any[],
    memoryContext: string
  ): Promise<{
    response: string;
    toolUsed?: string;
    memoryUsed?: boolean;
    offlineMode?: boolean;
  }> {
    const ollama = getOllamaClient();

    // Check if Ollama is available
    if (await ollama.isAvailable()) {
      try {
        // Build conversation context
        const contextMessages = [
          { role: 'system' as const, content: this.SYSTEM_PROMPT + ' (OFFLINE MODE)' },
          ...conversationHistory.slice(-5), // Last 5 messages for context
          { role: 'user' as const, content: userMessage }
        ];

        if (memoryContext) {
          contextMessages.splice(1, 0, {
            role: 'system',
            content: `Relevant memory context: ${memoryContext}`
          });
        }

        const response = await ollama.generateChatCompletion(contextMessages);

        if (response) {
          return {
            response: response.trim(),
            toolUsed: 'ollama',
            memoryUsed: memoryContext.length > 0,
            offlineMode: true
          };
        }
      } catch (error) {
        console.warn('Ollama generation failed:', error.message);
      }
    }

    // Fallback to rule-based responses
    let response = 'I\'m currently operating in offline mode with limited capabilities. ';

    // Check for common patterns
    if (userMessage.toLowerCase().includes('hello') || userMessage.toLowerCase().includes('hi')) {
      response += 'Hello! How can I assist you today?';
    } else if (userMessage.toLowerCase().includes('status')) {
      response += 'I\'m running in offline mode. Ollama may not be available, so responses are limited.';
    } else if (userMessage.toLowerCase().includes('memory') || userMessage.toLowerCase().includes('remember')) {
      if (memoryContext) {
        response += 'I can access local memory. Let me check what I remember...';
      } else {
        response += 'I have access to local memory, but I don\'t have specific memories related to your query.';
      }
    } else {
      response += 'I understand you said: "' + userMessage + '". In offline mode, my responses are limited, but I\'m still here to help with basic tasks.';
    }

    if (memoryContext) {
      response += '\n\nBased on our past conversations: ' + memoryContext.slice(0, 200) + '...';
    }

    return {
      response,
      memoryUsed: memoryContext.length > 0,
      offlineMode: true
    };
  }

  /**
   * Log a conversation turn to memory
   */
  async logConversationTurn(
    context: ConversationContext,
    userMessage: string,
    assistantResponse: string
  ): Promise<void> {
    try {
      // Ensure chat exists
      let chat = await this.db.getChat(context.chatId);
      if (!chat) {
        chat = await this.db.createChat({
          id: context.chatId,
          user_id: context.userId,
          metadata: { source: 'agent' }
        });
      }

      // Add messages
      const messages = [
        {
          id: `user-${Date.now()}`,
          role: 'user',
          content: userMessage,
          metadata: {}
        },
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: assistantResponse,
          metadata: {}
        }
      ];

      await this.db.appendMessages(context.chatId, messages);

      // Generate embeddings for searchable content
      for (const message of messages) {
        await this.memorySearch.storeMessageWithEmbedding(message.id, message.content);
      }

    } catch (error) {
      console.error('Failed to log conversation:', error.message);
    }
  }

  /**
   * Get agent status
   */
  async getStatus(): Promise<{
    online: boolean;
    hasOpenAI: boolean;
    hasLocalMemory: boolean;
    lastSync?: Date;
  }> {
    const isOnline = await this.cloudSync.isOnline();

    // Check if we have local chats
    const recentChats = await this.db.listRecentChats(undefined, 1);
    const hasLocalMemory = recentChats.length > 0;

    return {
      online: isOnline,
      hasOpenAI: !!this.openai,
      hasLocalMemory,
      lastSync: new Date() // TODO: track actual last sync time
    };
  }
}

// Global instance
let brainInstance: AgentBrain | null = null;

export function getAgentBrain(): AgentBrain {
  if (!brainInstance) {
    brainInstance = new AgentBrain();
  }
  return brainInstance;
}
