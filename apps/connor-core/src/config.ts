import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const configSchema = z.object({
  // OpenAI Configuration
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),

  // Cloudflare Configuration
  CLOUDFLARE_API_BASE: z.string().url().default('https://api.bozza.au'),
  CLOUDFLARE_MCP_URL: z.string().url().default('https://bozza-mcp.bozza.workers.dev/sse'),

  // Database Configuration
  DATABASE_URL: z.string().url().default('postgres://connor:connor_password@connor-db:5432/connor'),

  // Offline LLM Configuration
  USE_OLLAMA_OFFLINE: z.string().transform(val => val === 'true').default('false'),
  OLLAMA_BASE_URL: z.string().url().default('http://ollama:11434'),
  OLLAMA_MODEL: z.string().default('llama3'),

  // Agent Configuration
  AGENT_VOICE: z.string().default('alloy'),
  AGENT_MODEL: z.string().default('gpt-4o-realtime-preview'),

  // Computer Use Configuration
  COMPUTER_USE_ENABLED: z.string().transform(val => val === 'true').default('true'),
  COMPUTER_USE_BROWSER: z.enum(['headless', 'visible']).default('headless'),

  // Server Configuration
  PORT: z.string().transform(val => parseInt(val)).default('8080'),
});

export type Config = z.infer<typeof configSchema>;

let config: Config | null = null;

export function getConfig(): Config {
  if (!config) {
    const result = configSchema.safeParse(process.env);

    if (!result.success) {
      console.error('Configuration validation failed:');
      result.error.errors.forEach(error => {
        console.error(`- ${error.path.join('.')}: ${error.message}`);
      });
      throw new Error('Invalid configuration');
    }

    config = result.data;
  }

  return config;
}

// Helper functions for common config checks
export const isOnlineFeaturesEnabled = (): boolean => {
  const cfg = getConfig();
  return !!cfg.OPENAI_API_KEY;
};

export const isOfflineModeEnabled = (): boolean => {
  const cfg = getConfig();
  return cfg.USE_OLLAMA_OFFLINE;
};

export const isComputerUseEnabled = (): boolean => {
  const cfg = getConfig();
  return cfg.COMPUTER_USE_ENABLED;
};
