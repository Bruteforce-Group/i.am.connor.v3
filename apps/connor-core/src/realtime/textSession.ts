import * as readline from 'readline';
import { getAgentBrain } from '../agent/brain.js';
import { getDatabase } from '../memory/localDb.js';
import { v4 as uuidv4 } from 'uuid';

export async function textSession(): Promise<void> {
  const brain = getAgentBrain();
  const db = getDatabase();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('🤖 i.am.connor.v3 - Text Chat Mode');
  console.log('Type your messages. Type "exit" or "quit" to end the session.');
  console.log('─'.repeat(50));

  const chatId = uuidv4();
  const context = {
    chatId,
    messages: [] as Array<{
      role: 'user' | 'assistant' | 'system';
      content: string;
      timestamp?: Date;
    }>
  };

  function askQuestion(): void {
    rl.question('\nYou: ', async (input) => {
      if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
        console.log('\n👋 Goodbye!');
        rl.close();
        return;
      }

      if (!input.trim()) {
        askQuestion();
        return;
      }

      try {
        console.log('🤔 Thinking...');

        // Process the message
        const result = await brain.processMessage(input, context);

        // Add to context
        context.messages.push({
          role: 'user',
          content: input,
          timestamp: new Date()
        });

        context.messages.push({
          role: 'assistant',
          content: result.response,
          timestamp: new Date()
        });

        // Log to database
        await brain.logConversationTurn(context, input, result.response);

        // Display response
        console.log(`\nConnor: ${result.response}`);

        if (result.memoryUsed) {
          console.log('🧠 (Used memory for context)');
        }

        if (result.offlineMode) {
          console.log('🔌 (Offline mode)');
        }

        // Keep only last 20 messages in context
        if (context.messages.length > 20) {
          context.messages = context.messages.slice(-20);
        }

        askQuestion();

      } catch (error) {
        console.error('❌ Error processing message:', error.message);
        askQuestion();
      }
    });
  }

  // Initialize chat in database
  try {
    await db.createChat({
      id: chatId,
      user_id: 'cli-user',
      metadata: { mode: 'text', source: 'cli' }
    });
  } catch (error) {
    console.warn('Failed to initialize chat:', error.message);
  }

  askQuestion();
}
