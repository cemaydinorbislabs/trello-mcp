import Bottleneck from 'bottleneck';
import { logger } from '../core/logger.js';

export interface RateLimiterStats {
  running: number;
  pending: number;
  executing: number;
  done: number;
  failed: number;
}

export interface RateLimitOptions {
  maxConcurrent?: number;
  minTime?: number;
  maxTime?: number;
  reservoir?: number;
  reservoirRefreshAmount?: number;
  reservoirRefreshInterval?: number;
}

class TrelloRateLimiter {
  private limiter: Bottleneck;
  private stats: {
    requests: number;
    errors: number;
    retries: number;
  };

  constructor(options?: RateLimitOptions) {
    // const rateLimitConfig = config.rateLimit; // Not used currently
    
    // Trello API limits: 100 requests per 10 seconds per token
    // We'll be more permissive for MCP usage: 50 requests per second with quick refill
    this.limiter = new Bottleneck({
      maxConcurrent: options?.maxConcurrent || 10, // Max concurrent requests
      minTime: options?.minTime || 50, // Min time between requests (50ms = 20 req/sec)
      reservoir: options?.reservoir || 50, // Initial capacity (higher)
      reservoirRefreshAmount: options?.reservoirRefreshAmount || 25, // Refill amount (higher)
      reservoirRefreshInterval: options?.reservoirRefreshInterval || 2000, // Refill every 2 seconds (faster)
      
      // Retry configuration
      retryDelayMultiplier: 1.5,
      maxRetryDelay: 10000, // Max 10 seconds (shorter)
      
      // Job options
      trackDoneStatus: true,
      
      // High priority jobs won't wait for low priority ones
      highWater: 50,
      strategy: Bottleneck.strategy.LEAK,
    });

    this.stats = {
      requests: 0,
      errors: 0,
      retries: 0,
    };

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Request started
    this.limiter.on('executing', (info) => {
      this.stats.requests++;
      logger.debug(`Rate limiter: Executing job ${info.options.id || 'unknown'}`);
    });

    // Request completed successfully
    this.limiter.on('done', (info) => {
      logger.debug(`Rate limiter: Job completed ${info.options.id || 'unknown'}`);
    });

    // Request failed
    this.limiter.on('failed', (error, info) => {
      this.stats.errors++;
      logger.warn(`Rate limiter: Job failed ${info.options.id || 'unknown'}`, { error: error.message });
    });

    // Request retried
    this.limiter.on('retry', (error, info) => {
      this.stats.retries++;
      logger.info(`Rate limiter: Retrying job ${info.options.id || 'unknown'}`, { 
        error: typeof error === 'string' ? error : (error as any).message || 'Unknown error',
        retryCount: info.retryCount 
      });
    });

    // Reservoir depleted
    this.limiter.on('depleted', (empty) => {
      logger.warn('Rate limiter: Reservoir depleted', { empty });
    });

    // Error occurred
    this.limiter.on('error', (error) => {
      logger.error('Rate limiter error:', error);
    });

    // Debug logging for reservoir changes
    this.limiter.on('debug', (message, data) => {
      logger.debug(`Rate limiter debug: ${message}`, data);
    });
  }

  /**
   * Schedule a function to be executed with rate limiting
   */
  async schedule<T>(
    fn: () => Promise<T>,
    options?: {
      priority?: number;
      weight?: number;
      expiration?: number;
      id?: string;
    }
  ): Promise<T> {
    const jobOptions = {
      priority: options?.priority || 5,
      weight: options?.weight || 1,
      expiration: options?.expiration || 60000, // 1 minute default
      id: options?.id || `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };

    try {
      const result = await this.limiter.schedule(jobOptions, fn);
      return result;
    } catch (error) {
      logger.error(`Rate limited function failed: ${jobOptions.id}`, error);
      throw error;
    }
  }

  /**
   * Schedule a high priority request (for critical operations)
   */
  async scheduleHighPriority<T>(fn: () => Promise<T>, id?: string): Promise<T> {
    return this.schedule(fn, { priority: 9, id: id || `high-priority-${Date.now()}` });
  }

  /**
   * Schedule a low priority request (for background operations)
   */
  async scheduleLowPriority<T>(fn: () => Promise<T>, id?: string): Promise<T> {
    return this.schedule(fn, { priority: 1, id: id || `low-priority-${Date.now()}` });
  }

  /**
   * Check if we should throttle based on error rate
   */
  shouldThrottle(): boolean {
    const errorRate = this.stats.requests > 0 ? this.stats.errors / this.stats.requests : 0;
    return errorRate > 0.1; // Throttle if error rate > 10%
  }

  /**
   * Get current rate limiter statistics
   */
  getStats(): RateLimiterStats & typeof this.stats {
    const counts = this.limiter.counts();
    return {
      running: counts.RUNNING,
      pending: counts.QUEUED,
      executing: counts.EXECUTING,
      done: counts.DONE || 0,
      failed: this.stats.errors,
      ...this.stats,
    };
  }

  /**
   * Get current reservoir level
   */
  getReservoirLevel(): number {
    // Bottleneck v3 doesn't have reservoir method, return 0
    return 0;
  }

  /**
   * Check if limiter is currently busy
   */
  isBusy(): boolean {
    const counts = this.limiter.counts();
    return counts.QUEUED > 10 || counts.EXECUTING > 3;
  }

  /**
   * Wait for all jobs to complete
   */
  async waitForQuiet(): Promise<void> {
    const timeout = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (this.limiter.counts().QUEUED > 0 || this.limiter.counts().EXECUTING > 0) {
      if (Date.now() - startTime > timeout) {
        throw new Error('Timeout waiting for rate limiter to become quiet');
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Stop the limiter and cancel all pending jobs
   */
  async stop(options?: { dropWaitingJobs?: boolean }): Promise<void> {
    logger.info('Stopping rate limiter...');
    
    if (options?.dropWaitingJobs) {
      // Cancel all waiting jobs
      await this.limiter.stop({
        dropWaitingJobs: true,
        dropErrorMessage: 'Rate limiter stopped',
      });
    } else {
      // Wait for current jobs to finish
      await this.waitForQuiet();
    }
    
    logger.info('Rate limiter stopped');
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      requests: 0,
      errors: 0,
      retries: 0,
    };
    logger.info('Rate limiter stats reset');
  }

  /**
   * Update limiter configuration
   */
  updateConfig(options: RateLimitOptions): void {
    if (options.reservoir !== undefined) {
      this.limiter.updateSettings({ reservoir: options.reservoir });
    }
    if (options.reservoirRefreshAmount !== undefined) {
      this.limiter.updateSettings({ reservoirRefreshAmount: options.reservoirRefreshAmount });
    }
    if (options.reservoirRefreshInterval !== undefined) {
      this.limiter.updateSettings({ reservoirRefreshInterval: options.reservoirRefreshInterval });
    }
    if (options.maxConcurrent !== undefined) {
      this.limiter.updateSettings({ maxConcurrent: options.maxConcurrent });
    }
    if (options.minTime !== undefined) {
      this.limiter.updateSettings({ minTime: options.minTime });
    }
    
    logger.info('Rate limiter configuration updated', options);
  }
}

// Export singleton instance
export const rateLimiter = new TrelloRateLimiter();
export default rateLimiter;
