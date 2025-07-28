import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration schema validation
const ConfigSchema = z.object({
  trello: z.object({
    apiKey: z.string().min(1, 'Trello API key is required'),
    token: z.string().min(1, 'Trello token is required'),
  }),
  server: z.object({
    name: z.string().default('trello-mcp-server'),
    version: z.string().default('1.0.0'),
  }),
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  }),
  cache: z.object({
    ttl: z.number().positive().default(300), // 5 minutes
    maxKeys: z.number().positive().default(1000),
  }),
  rateLimit: z.object({
    maxRequests: z.number().positive().default(100),
    windowMs: z.number().positive().default(3600000), // 1 hour
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

class ConfigManager {
  private static instance: ConfigManager;
  private config: Config;

  private constructor() {
    this.config = this.loadConfig();
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadConfig(): Config {
    const rawConfig = {
      trello: {
        apiKey: process.env.TRELLO_API_KEY || '',
        token: process.env.TRELLO_TOKEN || '',
      },
      server: {
        name: process.env.MCP_SERVER_NAME || 'trello-mcp-server',
        version: process.env.MCP_SERVER_VERSION || '1.0.0',
      },
      logging: {
        level: (process.env.LOG_LEVEL as any) || 'warn',
      },
      cache: {
        ttl: parseInt(process.env.CACHE_TTL || '300'),
        maxKeys: parseInt(process.env.CACHE_MAX_KEYS || '1000'),
      },
      rateLimit: {
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100'),
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '3600000'),
      },
    };

    try {
      return ConfigSchema.parse(rawConfig);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map(issue => 
          `${issue.path.join('.')}: ${issue.message}`
        ).join('\n');
        throw new Error(`Configuration validation failed:\n${issues}`);
      }
      throw error;
    }
  }

  public get(): Config {
    return this.config;
  }

  public reload(): void {
    this.config = this.loadConfig();
  }

  // Getter methods for convenience
  public get trello() {
    return this.config.trello;
  }

  public get server() {
    return this.config.server;
  }

  public get logging() {
    return this.config.logging;
  }

  public get cache() {
    return this.config.cache;
  }

  public get rateLimit() {
    return this.config.rateLimit;
  }
}

// Export singleton instance
export const config = ConfigManager.getInstance();
export default config;
