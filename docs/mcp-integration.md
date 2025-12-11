# MCP Integration Guide

This guide explains how to integrate i.am.connor.v3's memory system with other AI applications using the Model Context Protocol (MCP).

## Overview

Bozza Archive provides long-term memory capabilities through a Cloudflare-hosted MCP server. External AI applications can use this memory to maintain context across conversations and sessions.

## MCP Server Details

- **Server URL**: `https://bozza-mcp.bozza.workers.dev/sse`
- **Protocol**: MCP over Server-Sent Events (SSE)
- **Authentication**: None required (public access)

## Available Tools

### 1. `search`
Search through chat history using semantic similarity.

**Parameters:**
- `query` (string, required): Search query
- `top_k` (number, optional): Number of results to return (default: 10)
- `user_id` (string, optional): Filter by user ID
- `project` (string, optional): Filter by project

**Example:**
```json
{
  "name": "search",
  "arguments": {
    "query": "machine learning projects",
    "top_k": 5,
    "user_id": "user123"
  }
}
```

### 2. `fetch`
Retrieve a specific chat or message by ID.

**Parameters:**
- `id` (string, required): Chat ID or Message ID to fetch

**Example:**
```json
{
  "name": "fetch",
  "arguments": {
    "id": "chat_abc123"
  }
}
```

### 3. `log_chat`
Log a new conversation to the archive.

**Parameters:**
- `chat_id` (string, required): Unique chat identifier
- `user_id` (string, optional): User identifier
- `messages` (array, required): Array of message objects
- `project` (string, optional): Project identifier

**Example:**
```json
{
  "name": "log_chat",
  "arguments": {
    "chat_id": "chat_abc123",
    "user_id": "user123",
    "messages": [
      {
        "role": "user",
        "content": "Hello, can you help me with a project?"
      },
      {
        "role": "assistant",
        "content": "I'd be happy to help! What kind of project are you working on?"
      }
    ],
    "project": "work"
  }
}
```

### 4. `delete_chat`
Delete a chat and all associated messages.

**Parameters:**
- `chat_id` (string, required): Chat ID to delete

**Example:**
```json
{
  "name": "delete_chat",
  "arguments": {
    "id": "chat_abc123"
  }
}
```

## Integration with ChatGPT

### Method 1: Custom Connector (Business/Enterprise)
1. In ChatGPT, navigate to **Settings** → **Connectors**
2. Create a new **Custom MCP Connector**
3. Set the **Server URL** to: `https://bozza-mcp.bozza.workers.dev/sse`
4. Configure the connector with your preferred settings

### Method 2: GPT Instructions
Add these instructions to your GPT's system prompt:

```
You have access to a long-term memory system through MCP tools. Use these tools to maintain context across conversations:

- Use `search` to find relevant past conversations before answering questions
- Use `log_chat` at the end of each conversation to store the interaction
- Use `fetch` when you need to retrieve specific conversation details

Always be transparent when using these tools. For example:
"I'm checking my memory for similar discussions..."
"I'm storing this conversation for future reference..."
```

## Integration with Claude

### Claude Web Interface
1. Go to **Settings** → **Connectors**
2. Click **Add MCP Integration**
3. Enter the MCP server URL: `https://bozza-mcp.bozza.workers.dev/sse`
4. Save the configuration

### Claude Desktop
1. Open Claude Desktop settings
2. Navigate to MCP integrations
3. Add a new remote MCP server
4. Enter the server URL: `https://bozza-mcp.bozza.workers.dev/sse`

### Claude Instructions
Add to your system prompt:

```
You can access long-term memory through MCP tools. Use them strategically:

Memory Access Pattern:
1. When a user asks about something that might have been discussed before, use `search`
2. At the end of each conversation, use `log_chat` to preserve the context
3. If referencing specific previous conversations, use `fetch`

Be conversational about memory usage: "Let me check if we've discussed this before..."
```

## Best Practices

### When to Use Memory Tools

**Search Before Answering:**
- Complex or technical questions
- When user mentions "remember" or "previously"
- Multi-part conversations spanning days/weeks
- Project-specific discussions

**Always Log Conversations:**
- After providing value (solutions, explanations, decisions)
- When learning user preferences or patterns
- At natural conversation breakpoints

### Data Management

**Privacy Considerations:**
- Avoid logging sensitive personal information
- Use hashed or anonymized user IDs in production
- Implement data retention policies

**Data Quality:**
- Log meaningful conversations, not just greetings
- Include context and project information when available
- Use consistent user/project identifiers

### Performance Tips

**Efficient Searching:**
- Use specific queries rather than general terms
- Include user_id filters when possible
- Limit top_k to reasonable numbers (5-20)

**Batch Logging:**
- Log complete conversation turns, not individual messages
- Use meaningful chat_ids for grouping related messages

## Troubleshooting

### Common Issues

**Connection Failed:**
- Verify the MCP server URL is correct
- Check if Cloudflare services are operational
- Ensure your network allows SSE connections

**Tool Not Available:**
- Confirm the MCP server is responding
- Check that the tool name matches exactly
- Verify parameter formats

**No Search Results:**
- Try broader search terms
- Check if conversations have been logged
- Remove filters if results are unexpectedly empty

### Debugging

Enable debug logging in your MCP client to see:
- Connection establishment
- Tool call requests/responses
- Error messages from the server

## Support

For issues with the Bozza Archive MCP server:
- Check server status: `https://api.bozza.au/health`
- Review this documentation
- Contact the development team

## Security Notes

- The current implementation provides public access
- In production deployments, implement proper authentication
- All data is encrypted at rest in Cloudflare
- Users retain full control over their data deletion
