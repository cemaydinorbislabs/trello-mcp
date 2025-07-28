#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// Import core modules
import { config, cache } from './core/index.js';

// Import Trello client
import { trelloClient } from './trello/index.js';

// Import tools
import { 
  getToolByName, 
  getToolDefinitions,
  toolRegistry 
} from './tools/index.js';

// CRITICAL FIX: Only suppress console outputs, don't touch stdout.write
function suppressConsoleOutputs() {
  // Only suppress console methods, let MCP SDK handle stdout properly
  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};
  console.warn = () => {};
  console.error = () => {};
  
  // Don't override process.stdout.write - let MCP SDK handle it
}

// Apply output suppression immediately
suppressConsoleOutputs();

// CLI argument parsing - but suppress any output
const args = process.argv.slice(2);
const isHelp = args.includes('--help') || args.includes('-h');
const isVersion = args.includes('--version') || args.includes('-v');

if (isHelp) {
  process.stderr.write(`
TrelloMCP Server - Model Context Protocol integration for Trello

Usage: npm start [options]

Options:
  -h, --help     Show this help message
  -v, --version  Show version information

Environment Variables:
  TRELLO_API_KEY     Your Trello API key
  TRELLO_TOKEN       Your Trello API token
  LOG_LEVEL          Log level (debug, info, warn, error)
  CACHE_TTL          Cache TTL in seconds (default: 300)
`);
  process.exit(0);
}

if (isVersion) {
  process.stderr.write(`TrelloMCP Server v${config.server.version}\nNode.js ${process.version}\n`);
  process.exit(0);
}

/**
 * Main MCP Server Implementation
 */
class TrelloMCPServer {
  private server: Server;
  private transport: StdioServerTransport;
  private isShuttingDown = false;

  constructor() {
    // Initialize MCP server
    this.server = new Server(
      {
        name: config.server.name,
        version: config.server.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize transport
    this.transport = new StdioServerTransport();

    // Setup event handlers
    this.setupEventHandlers();
  }

  /**
   * Setup server event handlers
   */
  private setupEventHandlers(): void {
    // Handle graceful shutdown
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    
    // Handle errors gracefully without any output
    process.on('uncaughtException', (error) => {
      // Common MCP/connection errors - ignore silently
      if ((error as any).code === 'EPIPE' || 
          (error as any).errno === -32 ||
          error instanceof SyntaxError && error.message.includes('JSON') ||
          error.message?.includes('Unexpected token') ||
          error.message?.includes('Unexpected non-whitespace') ||
          error.message?.includes('position 4') ||
          error.message?.includes('line 1 column 5')) {
        return;
      }
      
      // Log actual errors to stderr only
      process.stderr.write(`UNCAUGHT_EXCEPTION: ${error.message}\n`);
    });
    
    process.on('unhandledRejection', (reason) => {
      // Ignore common connection/parsing rejections
      if (reason && typeof reason === 'object' && 'code' in reason && (reason as any).code === 'EPIPE') {
        return;
      }
      
      if (reason instanceof SyntaxError && reason.message.includes('JSON')) {
        return;
      }
      
      if (reason && typeof reason === 'object' && 'message' in reason) {
        const message = (reason as any).message;
        if (message?.includes('Unexpected token') ||
            message?.includes('Unexpected non-whitespace') ||
            message?.includes('position 4') ||
            message?.includes('line 1 column 5')) {
          return;
        }
      }
      
      process.stderr.write(`UNHANDLED_REJECTION: ${String(reason)}\n`);
    });

    // Setup MCP protocol handlers
    this.setupMCPHandlers();
  }

  /**
   * Setup MCP protocol handlers
   */
  private setupMCPHandlers(): void {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      try {
        const toolDefinitions = getToolDefinitions();
        
        return {
          tools: toolDefinitions,
        };
      } catch (error) {
        process.stderr.write(`LIST_TOOLS_ERROR: ${error}\n`);
        throw error;
      }
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      try {
        const { name, arguments: args } = request.params;
        
        // Get tool by name
        const tool = getToolByName(name);
        if (!tool) {
          const error = `Tool '${name}' not found. Available tools: ${Array.from(toolRegistry.keys()).join(', ')}`;
          throw new Error(error);
        }

        // Execute tool with context
        const result = await tool.executeWithContext(args);

        return {
          content: result.content,
        };
      } catch (error) {
        process.stderr.write(`CALL_TOOL_ERROR: ${error}\n`);
        
        // Return error response
        return {
          content: [
            {
              type: 'text',
              text: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Initialize server and test connections
   */
  async initialize(): Promise<void> {
    try {
      // Test Trello connection
      await this.testTrelloConnection();
      
      // Initialize cache
      await this.initializeCache();
      
    } catch (error) {
      process.stderr.write(`INIT_ERROR: ${error}\n`);
      throw error;
    }
  }

  /**
   * Test Trello API connection
   */
  private async testTrelloConnection(): Promise<void> {
    try {
      const isConnected = await trelloClient.testConnection();
      
      if (!isConnected) {
        throw new Error('Trello connection test failed');
      }
      
    } catch (error) {
      throw new Error(`Trello API connection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Initialize cache system
   */
  private async initializeCache(): Promise<void> {
    try {
      // Test cache operations
      await cache.set('test', 'value', 60);
      const testValue = await cache.get('test');
      
      if (testValue !== 'value') {
        throw new Error('Cache test failed');
      }
      
    } catch (error) {
      throw error;
    }
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    try {
      // Connect to transport
      await this.server.connect(this.transport);
      
      // Keep the process alive
      await new Promise(() => {
        // This promise never resolves, keeping the process alive
      });
    } catch (error) {
      process.stderr.write(`START_ERROR: ${error}\n`);
      throw error;
    }
  }

  /**
   * Graceful shutdown
   */
  async gracefulShutdown(_signal: string): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;

    try {
      // Close server connection
      if (this.server) {
        await this.server.close();
      }

      // Clear cache
      if (cache) {
        cache.flush();
      }

      process.exit(0);
    } catch (error) {
      process.exit(1);
    }
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    const server = new TrelloMCPServer();
    
    // Initialize server
    await server.initialize();
    
    // Start server
    await server.start();
  } catch (error) {
    process.stderr.write(`MAIN_ERROR: ${error}\n`);
    process.exit(1);
  }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`FATAL_ERROR: ${error}\n`);
    process.exit(1);
  });
}

export { TrelloMCPServer };