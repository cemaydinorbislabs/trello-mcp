import NodeCache from 'node-cache';
import { config } from './config.js';
import { logger } from './logger.js';

export interface CacheStats {
  keys: number;
  hits: number;
  misses: number;
  hitRate: number;
}

export interface CacheOptions {
  ttl?: number;
  key?: string;
}

class MemoryCache {
  private cache: NodeCache;
  private stats: {
    hits: number;
    misses: number;
  };

  constructor() {
    const cacheConfig = config.cache;
    
    this.cache = new NodeCache({
      stdTTL: cacheConfig.ttl,
      maxKeys: cacheConfig.maxKeys,
      checkperiod: Math.floor(cacheConfig.ttl / 2), // Check expired keys every half TTL
      useClones: false, // Better performance, but be careful with object mutations
    });

    this.stats = {
      hits: 0,
      misses: 0,
    };

    // Set up event listeners
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.cache.on('set', (key: string) => {
      logger.debug(`Cache SET: ${key}`);
    });

    this.cache.on('del', (key: string) => {
      logger.debug(`Cache DEL: ${key}`);
    });

    this.cache.on('expired', (key: string) => {
      logger.debug(`Cache EXPIRED: ${key}`);
    });

    this.cache.on('flush', () => {
      logger.info('Cache flushed');
      this.resetStats();
    });
  }

  /**
   * Get value from cache
   */
  get<T = any>(key: string): T | undefined {
    const value = this.cache.get<T>(key);
    
    if (value !== undefined) {
      this.stats.hits++;
      logger.debug(`Cache HIT: ${key}`);
    } else {
      this.stats.misses++;
      logger.debug(`Cache MISS: ${key}`);
    }

    return value;
  }

  /**
   * Set value in cache
   */
  set<T = any>(key: string, value: T, ttl?: number): boolean {
    const success = this.cache.set(key, value, ttl || 0);
    
    if (success) {
      logger.debug(`Cache SET: ${key}${ttl ? ` (TTL: ${ttl}s)` : ''}`);
    } else {
      logger.warn(`Cache SET failed: ${key}`);
    }

    return success;
  }

  /**
   * Delete key from cache
   */
  del(key: string): number {
    const deleted = this.cache.del(key);
    if (deleted > 0) {
      logger.debug(`Cache DEL: ${key}`);
    }
    return deleted;
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Get all keys from cache
   */
  keys(): string[] {
    return this.cache.keys();
  }

  /**
   * Clear all cache
   */
  flush(): void {
    this.cache.flushAll();
    this.resetStats();
    logger.info('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;

    return {
      keys: this.cache.keys().length,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: Math.round(hitRate * 100) / 100, // Round to 2 decimal places
    };
  }

  /**
   * Reset statistics
   */
  private resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
  }

  /**
   * Get or set pattern - if key exists return it, otherwise execute function and cache result
   */
  async getOrSet<T>(
    key: string, 
    fn: () => Promise<T>, 
    options?: CacheOptions
  ): Promise<T> {
    // Try to get from cache first
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    // Execute function and cache result
    try {
      const result = await fn();
      this.set(key, result, options?.ttl);
      return result;
    } catch (error) {
      logger.error(`Error in getOrSet for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Generate cache key from multiple parts
   */
  static generateKey(...parts: (string | number)[]): string {
    return parts.join(':');
  }

  /**
   * Get cache info for debugging
   */
  getInfo(): object {
    return {
      stats: this.getStats(),
      options: {
        stdTTL: this.cache.options.stdTTL,
        maxKeys: this.cache.options.maxKeys,
        checkPeriod: this.cache.options.checkperiod,
      },
    };
  }

  /**
   * Warm up cache with initial data
   */
  async warmUp(data: Record<string, any>): Promise<void> {
    logger.info('Warming up cache...');
    
    for (const [key, value] of Object.entries(data)) {
      this.set(key, value);
    }
    
    logger.info(`Cache warmed up with ${Object.keys(data).length} entries`);
  }
}

// Export singleton instance
export const cache = new MemoryCache();
export default cache;
