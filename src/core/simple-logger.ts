// Simple console-only logger for MCP server
export class SimpleLogger {
  private level: string = 'info';

  constructor(level: string = 'info') {
    this.level = level;
  }

  private shouldLog(level: string): boolean {
    const levels = ['error', 'warn', 'info', 'debug'];
    const currentLevelIndex = levels.indexOf(this.level);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex <= currentLevelIndex;
  }

  private formatMessage(level: string, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    let formatted = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    if (meta) {
      formatted += ` ${JSON.stringify(meta)}`;
    }
    
    return formatted;
  }

  error(message: string, meta?: any): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, meta));
    }
  }

  warn(message: string, meta?: any): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, meta));
    }
  }

  info(message: string, meta?: any): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, meta));
    }
  }

  debug(message: string, meta?: any): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, meta));
    }
  }

  // Specialized logging methods to match existing interface
  trelloApi(method: string, endpoint: string, status?: number, duration?: number): void {
    const meta = { method, endpoint, status, duration };
    if (status && status >= 400) {
      this.error(`Trello API Error: ${method} ${endpoint}`, meta);
    } else {
      this.debug(`Trello API: ${method} ${endpoint}`, meta);
    }
  }

  cache(action: string, key: string, meta?: any): void {
    this.debug(`Cache ${action}: ${key}`, meta);
  }

  mcp(action: string, tool?: string, meta?: any): void {
    const message = tool ? `MCP ${action}: ${tool}` : `MCP ${action}`;
    this.info(message, meta);
  }

  performance(operation: string, duration: number, meta?: any): void {
    const logData = { operation, duration: `${duration}ms`, ...meta };
    if (duration > 1000) {
      this.warn(`Slow operation: ${operation}`, logData);
    } else {
      this.debug(`Performance: ${operation}`, logData);
    }
  }

  handleError(error: Error, context?: string): void {
    const meta = { stack: error.stack, context };
    this.error(error.message, meta);
  }

  request(method: string, url: string, body?: any): void {
    this.debug(`Request: ${method} ${url}`, { body });
  }

  response(method: string, url: string, status: number, duration: number): void {
    const meta = { method, url, status, duration: `${duration}ms` };
    if (status >= 400) {
      this.warn(`Response Error`, meta);
    } else {
      this.debug(`Response`, meta);
    }
  }

  setLevel(level: string): void {
    this.level = level;
    this.info(`Log level changed to: ${level}`);
  }

  getLevel(): string {
    return this.level;
  }

  child(_defaultMeta: any): any {
    // Simple implementation - just return this logger
    return this;
  }

  async flush(): Promise<void> {
    // No-op for console logger
    return Promise.resolve();
  }
}

// Export singleton instance
export const logger = new SimpleLogger(process.env.LOG_LEVEL || 'info');
export default logger;
