import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../core/logger.js';

export interface ToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

export interface ToolExecutionContext {
  toolName: string;
  arguments: any;
  startTime: number;
}

export abstract class BaseTool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly inputSchema: object;

  /**
   * Execute the tool with given arguments
   */
  abstract execute(args: any): Promise<ToolResult>;

  /**
   * Get tool definition for MCP
   */
  getDefinition(): Tool {
    return {
      name: this.name,
      description: this.description,
      inputSchema: {
        type: "object",
        ...this.inputSchema,
      },
    };
  }

  /**
   * Validate input arguments
   */
  protected validateArgs(args: any): void {
    // Basic validation - can be enhanced with Zod
    if (!args || typeof args !== 'object') {
      throw new Error('Invalid arguments: expected object');
    }
  }

  /**
   * Create success result
   */
  protected success(text: string): ToolResult {
    return {
      content: [{ type: 'text', text }],
      isError: false,
    };
  }

  /**
   * Create error result
   */
  protected error(message: string): ToolResult {
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }

  /**
   * Format object as readable text
   */
  protected formatObject(obj: any, title?: string): string {
    if (title) {
      return `${title}:\n${JSON.stringify(obj, null, 2)}`;
    }
    return JSON.stringify(obj, null, 2);
  }

  /**
   * Format list of items
   */
  protected formatList<T>(items: T[], formatter: (item: T) => string, title?: string): string {
    if (items.length === 0) {
      return title ? `${title}: No items found` : 'No items found';
    }

    const formattedItems = items.map(formatter).join('\n');
    return title ? `${title}:\n${formattedItems}` : formattedItems;
  }

  /**
   * Execute tool with logging and error handling
   */
  async executeWithContext(args: any): Promise<ToolResult> {
    const context: ToolExecutionContext = {
      toolName: this.name,
      arguments: args,
      startTime: Date.now(),
    };

    logger.mcp('Tool execution started', this.name, { args });

    try {
      // Validate arguments
      this.validateArgs(args);

      // Execute tool
      const result = await this.execute(args);

      // Log success
      const duration = Date.now() - context.startTime;
      logger.mcp('Tool execution completed', this.name, { 
        duration: `${duration}ms`,
        success: !result.isError 
      });

      return result;

    } catch (error) {
      // Log error
      const duration = Date.now() - context.startTime;
      logger.error(`Tool execution failed: ${this.name}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: `${duration}ms`,
        args,
      });

      return this.error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
  }

  /**
   * Format date for display
   */
  protected formatDate(date: string | Date): string {
    try {
      const d = typeof date === 'string' ? new Date(date) : date;
      return d.toLocaleDateString('tr-TR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Invalid date';
    }
  }

  /**
   * Truncate long text
   */
  protected truncateText(text: string, maxLength: number = 100): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Create summary statistics
   */
  protected createSummary(title: string, stats: Record<string, any>): string {
    const lines = [`${title}:`];
    for (const [key, value] of Object.entries(stats)) {
      lines.push(`  ${key}: ${value}`);
    }
    return lines.join('\n');
  }

  /**
   * Handle async operation with timeout
   */
  protected async withTimeout<T>(
    operation: Promise<T>, 
    timeoutMs: number = 30000,
    timeoutMessage: string = 'Operation timed out'
  ): Promise<T> {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });

    return Promise.race([operation, timeout]);
  }

  /**
   * Retry operation with exponential backoff
   */
  protected async retry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    initialDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt === maxRetries) {
          break; // Last attempt failed
        }

        const delay = initialDelay * Math.pow(2, attempt);
        logger.warn(`Tool operation failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`, {
          tool: this.name,
          error: lastError.message,
        });

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  /**
   * Parse comma-separated values
   */
  protected parseCommaSeparated(value: string | string[]): string[] {
    if (Array.isArray(value)) {
      return value;
    }
    return value.split(',').map(s => s.trim()).filter(s => s.length > 0);
  }

  /**
   * Validate required fields
   */
  protected validateRequired(args: any, fields: string[]): void {
    const missing = fields.filter(field => !args[field]);
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }
  }

  /**
   * Create table format for data
   */
  protected formatTable(data: any[], headers: string[]): string {
    if (data.length === 0) {
      return 'No data to display';
    }

    const rows = [headers];
    rows.push(headers.map(() => '---'));
    
    data.forEach(item => {
      const row = headers.map(header => {
        const value = item[header];
        return value !== undefined ? String(value) : '';
      });
      rows.push(row);
    });

    return rows.map(row => `| ${row.join(' | ')} |`).join('\n');
  }
}
