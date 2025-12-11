# i.am.connor.v3 🤖

A Jarvis-like AI assistant with voice conversations, computer control, and long-term memory across all your AI applications.

![Architecture](https://img.shields.io/badge/Architecture-Cloudflare%20%2B%20Docker-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## 🌟 What is i.am.connor.v3?

**i.am.connor.v3** is an advanced AI assistant that combines:

- **🎤 Voice Conversations**: Natural speech-to-speech dialogue using OpenAI's Realtime API
- **🖥️ Computer Control**: Browser and desktop automation via Computer Use tools
- **🧠 Long-term Memory**: Persistent knowledge across all your AI apps (ChatGPT, Claude, etc.)
- **🔄 Offline Resilience**: Continues working when internet is unavailable
- **☁️ Cloud Sync**: Automatic synchronization between local and cloud memory

Inspired by JARVIS from Iron Man, Connor provides a sophisticated, witty, and helpful AI companion that learns from every interaction.

## 🏗️ Architecture

### Cloud Layer (Bozza Archive)
- **REST API**: Structured endpoints for chat logging and search
- **MCP Server**: Model Context Protocol for universal AI integration
- **Vector Search**: Semantic similarity using Cloudflare Vectorize
- **D1 Database**: SQLite-compatible storage with edge replication

### Local Layer (Docker Stack)
- **Connor Core**: Node/TypeScript agent with voice and computer control
- **PostgreSQL**: Local memory with pgvector embeddings
- **Ollama**: Optional offline LLM fallback
- **Sync Service**: Automatic cloud synchronization

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- OpenAI API key (for voice and advanced features)
- Cloudflare account (for deployment)

### 1. Clone and Setup

```bash
git clone <repository-url>
cd i.am.connor.v3

# Copy environment template
cp .env.example .env

# Edit with your API keys
nano .env
```

### 2. Configure Environment

```bash
# Required
OPENAI_API_KEY=your_openai_api_key_here

# Cloudflare (for memory sync)
CLOUDFLARE_API_BASE=https://api.bozza.au
CLOUDFLARE_MCP_URL=https://bozza-mcp.bozza.workers.dev/sse

# Optional
USE_OLLAMA_OFFLINE=false
```

### 3. Launch the Stack

```bash
# Build and start all services
docker-compose up --build

# Or run in background
docker-compose up -d --build
```

### 4. Test the System

```bash
# Health check
curl http://localhost:8080/health

# Start text chat
docker-compose exec connor-core npm run text

# Start voice chat (requires audio devices)
docker-compose exec connor-core npm run voice
```

## 📋 Features

### Core Capabilities

- **🎤 Voice Interface**: Real-time speech-to-speech conversations
- **🖥️ Computer Control**: Web browsing, clicking, typing, screenshots
- **🧠 Memory System**: Semantic search across all conversations
- **🔄 Auto-Sync**: Seamless cloud synchronization
- **📱 Multi-Platform**: Works with ChatGPT, Claude, and custom integrations

### Memory Features

- **Semantic Search**: Find relevant conversations by meaning, not keywords
- **Cross-Platform**: Memory shared between all AI applications
- **Privacy Controls**: User-owned data with deletion rights
- **Offline Access**: Local memory continues working without internet

### Integration Options

- **MCP Protocol**: Native support for Model Context Protocol
- **REST API**: Direct HTTP endpoints for custom integrations
- **Webhooks**: Real-time notifications (future feature)

## 🛠️ Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `OPENAI_API_KEY` | OpenAI API key for Realtime API | - | Yes |
| `CLOUDFLARE_API_BASE` | Bozza Archive API URL | `https://api.bozza.au` | No |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://...` | No |
| `USE_OLLAMA_OFFLINE` | Enable Ollama offline fallback | `false` | No |
| `OLLAMA_BASE_URL` | Ollama server URL | `http://ollama:11434` | No |
| `AGENT_VOICE` | Voice for speech synthesis | `alloy` | No |
| `COMPUTER_USE_ENABLED` | Enable computer control | `true` | No |

### Cloudflare Deployment

1. **Install Wrangler CLI**:
   ```bash
   npm install -g wrangler
   ```

2. **Deploy API Worker**:
   ```bash
   cd apps/cloudflare-api
   wrangler d1 create chat_logs
   wrangler vectorize create chat-index --dimensions=768
   wrangler deploy
   ```

3. **Deploy MCP Worker**:
   ```bash
   cd apps/cloudflare-mcp
   wrangler deploy
   ```

## 🔧 Usage

### Text Chat Mode

```bash
# Interactive text chat
docker-compose exec connor-core npm run text

# HTTP API
curl -X POST http://localhost:8080/text \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello Connor!"}'
```

### Voice Chat Mode

```bash
# Voice conversation (requires microphone/speakers)
docker-compose exec connor-core npm run voice
```

### Memory Search

```bash
# Via HTTP API
curl -X POST http://localhost:8080/search \
  -H "Content-Type: application/json" \
  -d '{"query": "machine learning projects", "top_k": 5}'
```

## 🔌 Integrations

### ChatGPT Integration

1. Create a custom MCP connector in ChatGPT Business/Enterprise
2. Set server URL: `https://bozza-mcp.bozza.workers.dev/sse`
3. Add to GPT instructions: *"Use memory tools to maintain context across conversations"*

### Claude Integration

1. Go to Settings → Connectors → Add MCP Integration
2. Enter URL: `https://bozza-mcp.bozza.workers.dev/sse`
3. Configure memory usage in system prompts

### Custom Applications

Use the REST API or MCP protocol to integrate with any AI system:

```javascript
// REST API example
const response = await fetch('https://api.bozza.au/chat/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'user question',
    top_k: 5
  })
});
```

## 🔒 Security & Privacy

- **Data Ownership**: Users control their own data
- **Encryption**: All data encrypted at rest and in transit
- **No PII Storage**: Avoid storing sensitive personal information
- **Deletion Rights**: Complete data deletion available
- **Access Control**: Configurable authentication (future)

## 🐛 Troubleshooting

### Common Issues

**"OpenAI API key required"**
- Ensure `OPENAI_API_KEY` is set in `.env`
- Verify the key has Realtime API access

**"Cannot connect to database"**
- Check PostgreSQL container is running: `docker-compose ps`
- Verify database URL in environment variables

**"Cloud sync failing"**
- Check internet connectivity
- Verify Cloudflare API endpoints are accessible
- Review sync error logs

**"Ollama not available"**
- Start Ollama service: `docker-compose --profile with-ollama up ollama`
- Pull a model: `docker-compose exec ollama ollama pull llama3`

### Logs and Debugging

```bash
# View all logs
docker-compose logs

# View specific service logs
docker-compose logs connor-core

# Enter container for debugging
docker-compose exec connor-core sh
```

## 📚 API Reference

### REST Endpoints

- `GET /health` - Service health check
- `POST /text` - Process text message
- `POST /voice/session` - Initialize voice session
- `POST /search` - Search memory

### MCP Tools

- `search` - Semantic search through conversations
- `fetch` - Retrieve specific chat/message
- `log_chat` - Store conversation
- `delete_chat` - Remove chat data

Full API documentation: [OpenAPI Spec](config/openapi.yaml)

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

### Development Setup

```bash
# Install dependencies
npm install

# Start development environment
docker-compose -f docker-compose.dev.yml up

# Run tests
npm test

# Build all services
npm run build
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **OpenAI** for the Realtime API and Computer Use tools
- **Cloudflare** for the robust edge platform
- **Anthropic** for the Model Context Protocol inspiration
- **The AI community** for pushing the boundaries of assistant technology

## 📞 Support

- **Documentation**: [docs/](docs/)
- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions

---

**Built with ❤️ for the future of AI assistance**

*Remember: With great AI comes great responsibility. Use Connor wisely.*
