import { Ai } from '@cloudflare/workers-types';

export interface Env {
  CHAT_DB: D1Database;
  CHAT_INDEX: VectorizeIndex;
  AI: Ai;
}

interface LogRequest {
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

interface SearchRequest {
  query: string;
  top_k?: number;
  filter?: { user_id?: string; project?: string; [key: string]: string };
}

interface ChatResponse {
  chat: {
    id: string;
    created_at: string;
    user_id?: string;
    metadata?: Record<string, any>;
  };
  messages: Array<{
    id: string;
    role: string;
    content: string;
    created_at: string;
    metadata?: Record<string, any>;
  }>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // POST /chat/log
      if (url.pathname === '/chat/log' && request.method === 'POST') {
        const body: LogRequest = await request.json();

        // Validate request
        if (!body.chat_id || !body.messages || !Array.isArray(body.messages)) {
          return new Response(JSON.stringify({ error: 'Invalid request body' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Upsert chat
        await env.CHAT_DB.prepare(`
          INSERT OR REPLACE INTO chats (id, created_at, user_id, metadata)
          VALUES (?, ?, ?, ?)
        `).bind(
          body.chat_id,
          new Date().toISOString(),
          body.user_id || null,
          JSON.stringify(body.metadata || {})
        ).run();

        let insertedCount = 0;

        // Process each message
        for (const message of body.messages) {
          const messageId = message.id || crypto.randomUUID();

          // Insert message
          await env.CHAT_DB.prepare(`
            INSERT OR REPLACE INTO messages (id, chat_id, role, content, created_at, metadata)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(
            messageId,
            body.chat_id,
            message.role,
            message.content,
            message.created_at || new Date().toISOString(),
            JSON.stringify(message.metadata || {})
          ).run();

          // Generate embedding
          const embedding = await env.AI.run('@cf/baai/bge-small-en-v1.5', {
            text: message.content
          });

          // Upsert to Vectorize
          await env.CHAT_INDEX.upsert([
            {
              id: messageId,
              values: embedding.data[0],
              metadata: {
                chat_id: body.chat_id,
                role: message.role,
                user_id: body.user_id,
                created_at: message.created_at || new Date().toISOString()
              }
            }
          ]);

          insertedCount++;
        }

        return new Response(JSON.stringify({
          status: 'ok',
          inserted_messages: insertedCount
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // POST /chat/search
      if (url.pathname === '/chat/search' && request.method === 'POST') {
        const body: SearchRequest = await request.json();

        if (!body.query) {
          return new Response(JSON.stringify({ error: 'Query is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Generate query embedding
        const queryEmbedding = await env.AI.run('@cf/baai/bge-small-en-v1.5', {
          text: body.query
        });

        // Search Vectorize
        const topK = body.top_k || 10;
        const searchResults = await env.CHAT_INDEX.query(queryEmbedding.data[0], {
          topK,
          filter: body.filter
        });

        // Fetch message details from D1
        const results = [];
        for (const match of searchResults.matches) {
          const message = await env.CHAT_DB.prepare(`
            SELECT m.*, c.user_id as chat_user_id
            FROM messages m
            JOIN chats c ON m.chat_id = c.id
            WHERE m.id = ?
          `).bind(match.id).first();

          if (message) {
            results.push({
              id: match.id,
              score: match.score,
              message: {
                id: message.id,
                chat_id: message.chat_id,
                role: message.role,
                content: message.content,
                created_at: message.created_at,
                metadata: JSON.parse(message.metadata || '{}')
              },
              chat: {
                id: message.chat_id,
                user_id: message.chat_user_id
              }
            });
          }
        }

        return new Response(JSON.stringify({ results }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // GET /chat/:chat_id
      if (url.pathname.startsWith('/chat/') && request.method === 'GET') {
        const chatId = url.pathname.split('/chat/')[1];

        // Get chat
        const chat = await env.CHAT_DB.prepare(`
          SELECT * FROM chats WHERE id = ?
        `).bind(chatId).first();

        if (!chat) {
          return new Response(JSON.stringify({ error: 'Chat not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Get messages
        const messages = await env.CHAT_DB.prepare(`
          SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at
        `).bind(chatId).all();

        const response: ChatResponse = {
          chat: {
            id: chat.id,
            created_at: chat.created_at,
            user_id: chat.user_id,
            metadata: JSON.parse(chat.metadata || '{}')
          },
          messages: messages.results.map(msg => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            created_at: msg.created_at,
            metadata: JSON.parse(msg.metadata || '{}')
          }))
        };

        return new Response(JSON.stringify(response), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // DELETE /chat/:chat_id
      if (url.pathname.startsWith('/chat/') && request.method === 'DELETE') {
        const chatId = url.pathname.split('/chat/')[1];

        // Delete messages from Vectorize (get all message IDs first)
        const messages = await env.CHAT_DB.prepare(`
          SELECT id FROM messages WHERE chat_id = ?
        `).bind(chatId).all();

        const messageIds = messages.results.map(msg => msg.id);
        if (messageIds.length > 0) {
          await env.CHAT_INDEX.deleteByIds(messageIds);
        }

        // Delete from D1
        await env.CHAT_DB.prepare('DELETE FROM messages WHERE chat_id = ?').bind(chatId).run();
        await env.CHAT_DB.prepare('DELETE FROM chats WHERE id = ?').bind(chatId).run();

        return new Response(JSON.stringify({ status: 'ok' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // GET /health
      if (url.pathname === '/health' && request.method === 'GET') {
        return new Response(JSON.stringify({
          status: 'ok',
          timestamp: new Date().toISOString()
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // GET /llms.txt
      if (url.pathname === '/llms.txt' && request.method === 'GET') {
        const content = `# Bozza Archive API

Bozza Archive is a long-term memory system for AI conversations and knowledge.

## REST API

Base URL: https://api.bozza.au

### Endpoints

- POST /chat/log - Log chat conversations
- POST /chat/search - Search through chat history
- GET /chat/{chat_id} - Retrieve specific chat
- DELETE /chat/{chat_id} - Delete chat and associated data

## MCP Server

MCP Server URL: https://bozza-mcp.bozza.workers.dev/sse

### Tools

- search: Search through chat history
- fetch: Retrieve specific chat or message
- log_chat: Log new conversations
- delete_chat: Remove chats

## Safety

- No highly sensitive PII should be stored
- All data is encrypted at rest
- Users can delete their data at any time
- Data is retained for learning purposes only`;

        return new Response(content, {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/plain'
          }
        });
      }

      // GET /llms-full.txt
      if (url.pathname === '/llms-full.txt' && request.method === 'GET') {
        const content = `# Bozza Archive API - Full Documentation

Bozza Archive is a comprehensive long-term memory system designed for AI assistants and conversational applications.

## Purpose

Bozza Archive enables AI systems to maintain persistent memory across conversations, sessions, and even different AI models. It provides:

- Semantic search through conversation history
- Structured storage of chat logs
- Cross-platform memory sharing
- Privacy controls and data deletion

## REST API Specification

### Authentication

Currently no authentication required. In production, implement API key authentication.

### POST /chat/log

Logs a chat conversation with messages.

**Request Body:**
\`\`\`json
{
  "chat_id": "string",
  "user_id": "string (optional)",
  "metadata": {"key": "value"},
  "messages": [
    {
      "id": "string (optional)",
      "role": "user|assistant|system",
      "content": "string",
      "created_at": "ISO string (optional)",
      "metadata": {"key": "value"}
    }
  ]
}
\`\`\`

**Response:**
\`\`\`json
{
  "status": "ok",
  "inserted_messages": 5
}
\`\`\`

### POST /chat/search

Semantic search through chat history.

**Request Body:**
\`\`\`json
{
  "query": "string",
  "top_k": 10,
  "filter": {
    "user_id": "string",
    "project": "string"
  }
}
\`\`\`

**Response:**
\`\`\`json
{
  "results": [
    {
      "id": "message_id",
      "score": 0.95,
      "message": {...},
      "chat": {...}
    }
  ]
}
\`\`\`

### GET /chat/{chat_id}

Retrieve a complete chat conversation.

### DELETE /chat/{chat_id}

Delete a chat and all associated messages.

## MCP Integration

### Server URL
https://bozza-mcp.bozza.workers.dev/sse

### Available Tools

#### search
Search through chat history using semantic similarity.

**Input Schema:**
\`\`\`json
{
  "query": "string",
  "top_k": 10,
  "user_id": "string (optional)",
  "project": "string (optional)"
}
\`\`\`

#### fetch
Retrieve a specific chat or message by ID.

**Input Schema:**
\`\`\`json
{
  "id": "chat_id or message_id"
}
\`\`\`

#### log_chat
Log a new conversation.

**Input Schema:**
\`\`\`json
{
  "chat_id": "string",
  "user_id": "string (optional)",
  "messages": [
    {
      "role": "user|assistant|system",
      "content": "string"
    }
  ],
  "project": "string (optional)"
}
\`\`\`

#### delete_chat
Delete a chat and all its messages.

**Input Schema:**
\`\`\`json
{
  "chat_id": "string"
}
\`\`\`

## Integration Examples

### ChatGPT
1. Create a custom connector
2. Set MCP server URL
3. Instruct GPT to use tools for memory

### Claude
1. Add MCP integration in settings
2. Configure server URL
3. Use search and log_chat in conversations

## Privacy & Security

- User data is encrypted at rest
- No highly sensitive PII should be stored
- Users retain full control over their data
- Data deletion is permanent and immediate
- All access is logged for security monitoring

## Rate Limits

- 100 requests per minute per IP
- 1000 messages per day per user
- Contact support for higher limits`;

        return new Response(content, {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/plain'
          }
        });
      }

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('API Error:', error);
      return new Response(JSON.stringify({
        error: 'Internal server error',
        details: error.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
