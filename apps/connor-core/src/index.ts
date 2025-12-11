#!/usr/bin/env node

import express from 'express';
import { createServer } from 'http';
import { getConfig } from './config.js';
import { getAgentBrain } from './agent/brain.js';
import { getCloudSync } from './memory/cloudSync.js';
import { getDatabase, closeDatabase } from './memory/localDb.js';
import { voiceSession } from './realtime/voiceSession.js';
import { textSession } from './realtime/textSession.js';
import { v4 as uuidv4 } from 'uuid';

const config = getConfig();
const brain = getAgentBrain();
const cloudSync = getCloudSync();
const db = getDatabase();

async function main() {
  console.log('🚀 Starting i.am.connor.v3...');

  // Setup periodic sync
  const stopSync = cloudSync.startPeriodicSync(30000); // 30 seconds

  // Setup Express server
  const app = express();
  const server = createServer(app);

  app.use(express.json());

  // Health check endpoint
  app.get('/health', async (req, res) => {
    try {
      const status = await brain.getStatus();
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        ...status
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error.message
      });
    }
  });

  // Text query endpoint
  app.post('/text', async (req, res) => {
    try {
      const { message, chat_id, user_id } = req.body;

      if (!message) {
        return res.status(400).json({ error: 'Message is required' });
      }

      const chatId = chat_id || uuidv4();

      // Get conversation context
      const chat = await db.getChat(chatId);
      const messages = chat ? await db.getChatMessages(chatId) : [];

      const context = {
        chatId,
        userId: user_id,
        messages: messages.map(msg => ({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
          timestamp: msg.created_at
        }))
      };

      // Process message
      const result = await brain.processMessage(message, context);

      // Log conversation
      await brain.logConversationTurn(context, message, result.response);

      res.json({
        response: result.response,
        chat_id: chatId,
        memory_used: result.memoryUsed,
        offline_mode: result.offlineMode
      });

    } catch (error) {
      console.error('Text endpoint error:', error);
      res.status(500).json({
        error: 'Internal server error',
        details: error.message
      });
    }
  });

  // Voice session endpoint (placeholder for now)
  app.post('/voice/session', async (req, res) => {
    res.json({
      status: 'Voice session endpoint - implementation coming soon',
      realtime_available: !!config.OPENAI_API_KEY
    });
  });

  // Start server
  server.listen(config.PORT, '0.0.0.0', () => {
    console.log(`🌐 Server listening on port ${config.PORT}`);
    console.log(`📊 Health check: http://localhost:${config.PORT}/health`);
  });

  // CLI mode handling
  const args = process.argv.slice(2);

  if (args.includes('--cli') || args.includes('--text')) {
    console.log('💬 Starting text chat session...');
    await textSession();
    process.exit(0);
  }

  if (args.includes('--voice')) {
    console.log('🎤 Starting voice session...');
    await voiceSession();
    process.exit(0);
  }

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down i.am.connor.v3...');
    stopSync();
    await closeDatabase();
    server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down i.am.connor.v3...');
    stopSync();
    await closeDatabase();
    server.close();
    process.exit(0);
  });
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

main().catch((error) => {
  console.error('Failed to start:', error);
  process.exit(1);
});
