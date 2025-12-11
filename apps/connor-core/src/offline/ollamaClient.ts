import axios from 'axios';
import { getConfig } from '../config.js';

export interface OllamaResponse {
  response: string;
  done: boolean;
  context?: number[];
}

export class OllamaClient {
  private config = getConfig();
  private baseUrl: string;

  constructor() {
    this.baseUrl = this.config.OLLAMA_BASE_URL;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`, {
        timeout: 5000
      });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`);
      return response.data.models?.map((model: any) => model.name) || [];
    } catch (error) {
      console.warn('Failed to list Ollama models:', error.message);
      return [];
    }
  }

  async generateCompletion(
    prompt: string,
    options: {
      model?: string;
      system?: string;
      context?: number[];
      stream?: boolean;
    } = {}
  ): Promise<string> {
    const {
      model = this.config.OLLAMA_MODEL,
      system = '',
      context,
      stream = false
    } = options;

    try {
      const response = await axios.post(`${this.baseUrl}/api/generate`, {
        model,
        prompt: system ? `${system}\n\n${prompt}` : prompt,
        context,
        stream
      }, {
        timeout: 30000
      });

      return response.data.response || '';
    } catch (error) {
      console.error('Ollama generation failed:', error.message);
      return '';
    }
  }

  async generateChatCompletion(
    messages: Array<{
      role: 'user' | 'assistant' | 'system';
      content: string;
    }>,
    options: {
      model?: string;
      stream?: boolean;
    } = {}
  ): Promise<string> {
    const { model = this.config.OLLAMA_MODEL, stream = false } = options;

    // Convert to simple prompt format for Ollama
    const systemMessage = messages.find(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    let prompt = '';
    if (systemMessage) {
      prompt += `System: ${systemMessage.content}\n\n`;
    }

    prompt += conversationMessages.map(msg =>
      `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
    ).join('\n\n');

    prompt += '\n\nAssistant:';

    return this.generateCompletion(prompt, { model, stream });
  }

  async pullModel(modelName: string): Promise<boolean> {
    try {
      const response = await axios.post(`${this.baseUrl}/api/pull`, {
        name: modelName
      }, {
        timeout: 300000 // 5 minutes for model download
      });

      return response.status === 200;
    } catch (error) {
      console.error(`Failed to pull Ollama model ${modelName}:`, error.message);
      return false;
    }
  }
}

// Global instance
let ollamaInstance: OllamaClient | null = null;

export function getOllamaClient(): OllamaClient {
  if (!ollamaInstance) {
    ollamaInstance = new OllamaClient();
  }
  return ollamaInstance;
}
