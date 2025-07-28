import winston from 'winston';
import { config } from './config.js';

// Custom log levels
const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    debug: 'blue',
  },
};

// CRITICAL: Custom format that ONLY writes to stderr, never stdout
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss',
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info;
    
    let logMessage = `${timestamp} [${level}]: ${message}`;
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      logMessage += ` ${JSON.stringify(meta, null, 2)}`;
    }
    
    return logMessage;
  })
);

// Custom transport that ONLY writes to stderr
class StderrTransport extends winston.transports.Stream {
  constructor(options: any = {}) {
    super({
      ...options,
      stream: process.stderr, // Force all output to stderr
    });
  }
}

// Create logger instance
class Logger {
  private winston: winston.Logger;

  constructor() {
    winston.addColors(customLevels.colors);
    
    this.winston = winston.createLogger({
      levels: customLevels.levels,
      level: config.logging.level,
      format: customFormat,
      transports: [
        // ONLY stderr transport - no console or file transports
        new StderrTransport({
          handleExceptions: true,
          handleRejections: true,
        }),
      ],
      // Disable console warnings and other output
      silent: false,
      exitOnError: false,
    });
  }

  // Core logging methods - all go to stderr
  error(message: string, meta?: any): void {
    // Still filter MCP noise but allow real errors
    if (this.isMCPNoise(message)) {
      return;
    }
    this.winston.error(message, meta);
  }

  warn(message: string, meta?: any): void {
    if (this.isMCPNoise(message)) {
      return;
    }
    this.winston.warn(message, meta);
  }

  info(message: string, meta?: any): void {
    // For MCP servers, reduce info logging to minimum
    if (this.isMCPNoise(message) || this.isVerboseInfo(message)) {
      return;
    }
    this.winston.info(message, meta);
  }

  debug(message: string, meta?: any): void {
    // Only log debug if explicitly enabled and not MCP noise
    if (this.isMCPNoise(message) || config.logging.level !== 'debug') {
      return;
    }
    this.winston.debug(message, meta);
  }

  // Helper to detect MCP-related noise
  private isMCPNoise(message: string): boolean {
    const noisePatterns = [
      'Unexpected non-whitespace character after JSON',
      'Unexpected token',
      'Unexpected end of JSON input',
      'JSON.parse',
      'SyntaxError',
      'EPIPE',
      'ECONNRESET',
      'connection',
      'MCP trello-mcp:',
      'Method not found',
      'prompts/list',
      'prompts/get',
      'position 4',
      'line 1 column 5',
      'deserializeMessage',
      'StdioClientTransport',
      'processReadBuffer',
      'Error from MCP server:',
    ];

    return noisePatterns.some(pattern => message.includes(pattern));
  }

  // Helper to detect verbose info messages during MCP operations
  private isVerboseInfo(message: string): boolean {
    const verbosePatterns = [
      'Starting TrelloMCP Server',
      'Server started successfully',
      'Initializing TrelloMCP Server',
      'Testing Trello API connection',
      'Trello connection successful',
      'Initializing cache system',
      'Cache system initialized',
      'Tool registry loaded',
      'Server initialization completed',
      'Handling ListTools request',
      'Returning',
      'tool definitions',
      'Executing tool:',
      'executed successfully',
    ];

    return verbosePatterns.some(pattern => message.includes(pattern));
  }

  // Specialized logging methods - minimal output
  trelloApi(method: string, endpoint: string, status?: number, duration?: number): void {
    // Only log API errors, not successful calls
    if (status && status >= 400) {
      this.error(`Trello API Error: ${method} ${endpoint}`, { status, duration });
    }
  }

  cache(_action: string, _key: string, _meta?: any): void {
    // Don't log cache operations in MCP mode
    return;
  }

  mcp(_action: string, _tool?: string, _meta?: any): void {
    // Don't log MCP operations to avoid stdout pollution
    return;
  }

  performance(operation: string, duration: number, meta?: any): void {
    // Only log slow operations
    if (duration > 2000) {
      this.warn(`Slow operation: ${operation}`, { duration: `${duration}ms`, ...meta });
    }
  }

  handleError(error: Error, context?: string): void {
    // Only log non-MCP errors
    if (!this.isMCPNoise(error.message)) {
      this.error(error.message, { stack: error.stack, context });
    }
  }

  request(_method: string, _url: string, _body?: any): void {
    // Don't log requests in MCP mode
    return;
  }

  response(method: string, url: string, status: number, duration: number): void {
    // Only log error responses
    if (status >= 400) {
      this.error(`Response Error: ${method} ${url}`, { status, duration });
    }
  }

  // Set log level dynamically
  setLevel(level: string): void {
    this.winston.level = level;
  }

  // Get current log level
  getLevel(): string {
    return this.winston.level;
  }

  // Create child logger with context
  child(defaultMeta: any): winston.Logger {
    return this.winston.child(defaultMeta);
  }

  // Flush logs (useful for testing)
  async flush(): Promise<void> {
    return new Promise((resolve) => {
      this.winston.on('finish', resolve);
      this.winston.end();
    });
  }
}

// Export singleton instance
export const logger = new Logger();
export default logger;