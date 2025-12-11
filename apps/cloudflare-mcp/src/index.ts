// MCP Server implementation for Bozza Archive
// Uses remote MCP over SSE pattern

interface MCPServerRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: any;
}

interface MCPServerResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

// Available MCP tools
const TOOLS: MCPTool[] = [
  {
    name: 'search',
    description: 'Search through chat history using semantic similarity',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        top_k: { type: 'number', description: 'Number of results to return', default: 10 },
        user_id: { type: 'string', description: 'Filter by user ID' },
        project: { type: 'string', description: 'Filter by project' }
      },
      required: ['query']
    }
  },
  {
    name: 'fetch',
    description: 'Retrieve a specific chat or message by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Chat ID or Message ID to fetch' }
      },
      required: ['id']
    }
  },
  {
    name: 'log_chat',
    description: 'Log a new conversation to the archive',
    inputSchema: {
      type: 'object',
      properties: {
        chat_id: { type: 'string', description: 'Unique chat identifier' },
        user_id: { type: 'string', description: 'User identifier' },
        messages: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string', enum: ['user', 'assistant', 'system'] },
              content: { type: 'string' }
            },
            required: ['role', 'content']
          }
        },
        project: { type: 'string', description: 'Project identifier' }
      },
      required: ['chat_id', 'messages']
    }
  },
  {
    name: 'delete_chat',
    description: 'Delete a chat and all associated messages',
    inputSchema: {
      type: 'object',
      properties: {
        chat_id: { type: 'string', description: 'Chat ID to delete' }
      },
      required: ['chat_id']
    }
  }
];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // SSE endpoint for MCP
    if (request.method === 'GET') {
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      // Send initial connection message
      const initMessage = {
        jsonrpc: '2.0',
        id: null,
        method: 'connection/ready',
        params: {}
      };

      writer.write(encoder.encode(`data: ${JSON.stringify(initMessage)}\n\n`));

      // Return SSE response
      return new Response(readable, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // POST endpoint for MCP requests
    if (request.method === 'POST') {
      try {
        const mcpRequest: MCPServerRequest = await request.json();

        let result: any;

        switch (mcpRequest.method) {
          case 'initialize':
            result = {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: {}
              },
              serverInfo: {
                name: 'bozza-mcp',
                version: '1.0.0'
              }
            };
            break;

          case 'tools/list':
            result = {
              tools: TOOLS
            };
            break;

          case 'tools/call':
            result = await handleToolCall(mcpRequest.params, env);
            break;

          default:
            return new Response(JSON.stringify({
              jsonrpc: '2.0',
              id: mcpRequest.id,
              error: {
                code: -32601,
                message: 'Method not found'
              }
            }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const response: MCPServerResponse = {
          jsonrpc: '2.0',
          id: mcpRequest.id,
          result
        };

        return new Response(JSON.stringify(response), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (error) {
        console.error('MCP Error:', error);
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal error',
            data: error.message
          }
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders
    });
  }
};

// Handle tool calls by forwarding to the Archive API
async function handleToolCall(params: any, env: Env): Promise<any> {
  const apiBaseUrl = env.API_BASE_URL || 'https://api.bozza.au';

  switch (params.name) {
    case 'search':
      const searchResponse = await fetch(`${apiBaseUrl}/chat/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: params.arguments.query,
          top_k: params.arguments.top_k || 10,
          filter: {
            user_id: params.arguments.user_id,
            project: params.arguments.project
          }
        })
      });

      if (!searchResponse.ok) {
        throw new Error(`Search failed: ${searchResponse.status}`);
      }

      const searchData = await searchResponse.json();

      // Convert to MCP resource format
      const resources = searchData.results.map((result: any) => ({
        uri: `chat://message/${result.id}`,
        name: `Chat Message ${result.id.slice(0, 8)}`,
        description: result.message.content.slice(0, 100) + '...',
        mimeType: 'application/json'
      }));

      return {
        content: [{
          type: 'text',
          text: `Found ${searchData.results.length} relevant messages`
        }],
        resources
      };

    case 'fetch':
      const fetchResponse = await fetch(`${apiBaseUrl}/chat/${params.arguments.id}`);
      if (!fetchResponse.ok) {
        throw new Error(`Fetch failed: ${fetchResponse.status}`);
      }

      const chatData = await fetchResponse.json();

      return {
        content: [{
          type: 'text',
          text: `Retrieved chat with ${chatData.messages.length} messages`
        }],
        resources: [{
          uri: `chat://${params.arguments.id}`,
          name: `Chat ${params.arguments.id.slice(0, 8)}`,
          description: `Chat with ${chatData.messages.length} messages`,
          mimeType: 'application/json',
          content: JSON.stringify(chatData, null, 2)
        }]
      };

    case 'log_chat':
      const logResponse = await fetch(`${apiBaseUrl}/chat/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: params.arguments.chat_id,
          user_id: params.arguments.user_id,
          metadata: { project: params.arguments.project },
          messages: params.arguments.messages.map((msg: any) => ({
            role: msg.role,
            content: msg.content,
            created_at: new Date().toISOString()
          }))
        })
      });

      if (!logResponse.ok) {
        throw new Error(`Log failed: ${logResponse.status}`);
      }

      const logData = await logResponse.json();

      return {
        content: [{
          type: 'text',
          text: `Successfully logged ${logData.inserted_messages} messages to chat ${params.arguments.chat_id}`
        }]
      };

    case 'delete_chat':
      const deleteResponse = await fetch(`${apiBaseUrl}/chat/${params.arguments.chat_id}`, {
        method: 'DELETE'
      });

      if (!deleteResponse.ok) {
        throw new Error(`Delete failed: ${deleteResponse.status}`);
      }

      return {
        content: [{
          type: 'text',
          text: `Successfully deleted chat ${params.arguments.chat_id}`
        }]
      };

    default:
      throw new Error(`Unknown tool: ${params.name}`);
  }
}

interface Env {
  API_BASE_URL: string;
}
