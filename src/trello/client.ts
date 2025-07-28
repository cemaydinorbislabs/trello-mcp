import { config } from '../core/config.js';
import { cache } from '../core/memory-cache.js';
import { logger } from '../core/logger.js';
import { rateLimiter } from './rate-limiter.js';
import {
  TrelloBoard,
  TrelloList,
  TrelloCard,
  CreateCardRequest,
  UpdateCardRequest,
  CreateListRequest,
  UpdateListRequest,
  SearchRequest,
  SearchResponse,
  BulkCreateCardsRequest,
  BulkUpdateCardsRequest,
} from './types.js';

// Define TrelloApiError locally since it's not exported
// TrelloApiError interface removed as it's no longer used

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  useCache?: boolean;
  cacheTtl?: number;
  priority?: 'high' | 'normal' | 'low';
  retries?: number;
}

export interface TrelloClientStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  cacheHits: number;
  cacheMisses: number;
  averageResponseTime: number;
}

class TrelloClient {
  private baseUrl: string;
  private apiKey: string;
  private token: string;
  private stats: TrelloClientStats;

  constructor() {
    const trelloConfig = config.trello;
    this.baseUrl = 'https://api.trello.com/1';
    this.apiKey = trelloConfig.apiKey;
    this.token = trelloConfig.token;
    
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageResponseTime: 0,
    };

    this.validateCredentials();
  }

  private validateCredentials(): void {
    if (!this.apiKey || !this.token) {
      throw new Error('Trello API key and token are required. Please check your configuration.');
    }
  }

  /**
   * Optimize edilmiş şekilde liste kartlarını getir
   */
  async getListCardsOptimized(
    listId: string, 
    options: {
      fields?: string;
      includeCustomFields?: boolean;
      includePluginData?: boolean;
      includeMembers?: boolean;
      includeLabels?: boolean;
    } = {}
  ): Promise<any[]> {
    
    const params = new URLSearchParams({
      fields: options.fields || 'all',
    });

    // Power-Up verilerini dahil et
    if (options.includeCustomFields !== false) {
      params.append('customFieldItems', 'true');
    }
    
    if (options.includePluginData !== false) {
      params.append('pluginData', 'true');
    }
    
    if (options.includeMembers !== false) {
      params.append('members', 'true');
    }
    
    if (options.includeLabels !== false) {
      params.append('labels', 'true');
    }

    // Tek API çağrısıyla optimize et
    return this.makeRequest<any[]>(`/lists/${listId}/cards?${params.toString()}`);
  }

  /**
   * Make HTTP request to Trello API
   */
  private async makeRequest<T>(
    endpoint: string, 
    options: ApiRequestOptions = {}
  ): Promise<T> {
    const {
      method = 'GET',
      body,
      useCache = true,
      cacheTtl,
      priority = 'normal',
      retries = 3,
    } = options;

    const url = `${this.baseUrl}${endpoint}`;
    const cacheKey = this.generateCacheKey(method, endpoint, body);
    const startTime = Date.now();

    // Try cache first for GET requests
    if (method === 'GET' && useCache) {
      const cached = cache.get<T>(cacheKey);
      if (cached !== undefined) {
        this.stats.cacheHits++;
        logger.debug(`Cache hit for ${method} ${endpoint}`);
        return cached;
      }
      this.stats.cacheMisses++;
    }

    // Schedule request through rate limiter
    const scheduleRequest = () => {
      switch (priority) {
        case 'high':
          return rateLimiter.scheduleHighPriority(() => this.executeRequest<T>(url, method, body));
        case 'low':
          return rateLimiter.scheduleLowPriority(() => this.executeRequest<T>(url, method, body));
        default:
          return rateLimiter.schedule(() => this.executeRequest<T>(url, method, body));
      }
    };

    try {
      let lastError: Error | undefined;
      let attempt = 0;

      while (attempt <= retries) {
        try {
          const result = await scheduleRequest();
          
          // Update stats
          const duration = Date.now() - startTime;
          this.updateStats(true, duration);
          
          // Cache successful GET requests
          if (method === 'GET' && useCache && result) {
            cache.set(cacheKey, result, cacheTtl);
          }

          logger.trelloApi(method, endpoint, 200, duration);
          return result;

        } catch (error) {
          lastError = error as Error;
          attempt++;
          
          // Log detailed error information
          const errorDetails = {
            endpoint,
            method,
            attempt,
            retries,
            error: error instanceof Error ? {
              message: error.message,
              name: error.name,
              stack: error.stack
            } : error
          };
          
          logger.error(`Trello API request failed (attempt ${attempt}/${retries})`, errorDetails);
          
          if (attempt <= retries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s
            logger.warn(`Request failed, retrying in ${delay}ms (attempt ${attempt}/${retries})`, {
              endpoint,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      // All retries failed
      this.updateStats(false, Date.now() - startTime);
      
      // Create a more detailed error message
      const detailedError = new Error(
        `Trello API request failed after ${retries} attempts: ${endpoint} - ${lastError?.message || 'Unknown error'}`
      );
      (detailedError as any).originalError = lastError;
      (detailedError as any).endpoint = endpoint;
      (detailedError as any).method = method;
      
      throw detailedError;
    } catch (error) {
      this.updateStats(false, Date.now() - startTime);
      logger.trelloApi(method, endpoint, error instanceof Error && 'status' in error ? (error as any).status : 500, Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Execute HTTP request
   */
  private async executeRequest<T>(url: string, method: string, body?: any): Promise<T> {
    // Parse existing URL to handle endpoints that already have query parameters
    const urlObj = new URL(url);
    
    // Add authentication parameters
    urlObj.searchParams.set('key', this.apiKey);
    urlObj.searchParams.set('token', this.token);
    
    const requestUrl = urlObj.toString();
    const requestOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TrelloMCP/1.0.0',
      },
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      requestOptions.body = JSON.stringify(body);
    }

    logger.debug(`Making request: ${method} ${url}`);

    const response = await fetch(requestUrl, requestOptions);
    
    if (!response.ok) {
      let errorData: any;
      let responseText = '';
      
      try {
        responseText = await response.text();
        errorData = JSON.parse(responseText);
      } catch (parseError) {
        // If response is not JSON, use the text as error message
        errorData = { message: responseText || 'Unknown error' };
      }
      
      // Log detailed error information
      process.stderr.write(`TRELLO_API_ERROR: ${response.status} ${response.statusText}\n`);
      process.stderr.write(`REQUEST_URL: ${requestUrl}\n`);
      process.stderr.write(`RESPONSE_TEXT: ${responseText}\n`);
      process.stderr.write(`ERROR_DATA: ${JSON.stringify(errorData, null, 2)}\n`);
      
      const error = new Error(errorData.message || responseText || `HTTP ${response.status}`);
      (error as any).status = response.status;
      (error as any).error = errorData.error || 'API_ERROR';
      (error as any).responseText = responseText;
      (error as any).requestUrl = requestUrl;
      
      throw error;
    }

    const data = await response.json();
    return data;
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(method: string, endpoint: string, body?: any): string {
    const parts = [method, endpoint];
    if (body) {
      parts.push(JSON.stringify(body));
    }
    return parts.join('|');
  }

  /**
   * Update client statistics
   */
  private updateStats(success: boolean, duration: number): void {
    this.stats.totalRequests++;
    if (success) {
      this.stats.successfulRequests++;
    } else {
      this.stats.failedRequests++;
    }
    
    // Update average response time
    const totalTime = this.stats.averageResponseTime * (this.stats.totalRequests - 1) + duration;
    this.stats.averageResponseTime = Math.round(totalTime / this.stats.totalRequests);
  }

  // Board operations
  async getBoards(): Promise<TrelloBoard[]> {
    return this.makeRequest<TrelloBoard[]>('/members/me/boards');
  }

  async getBoard(boardId: string): Promise<TrelloBoard> {
    return this.makeRequest<TrelloBoard>(`/boards/${boardId}`);
  }

  // List operations
  async getBoardLists(boardId: string): Promise<TrelloList[]> {
    return this.makeRequest<TrelloList[]>(`/boards/${boardId}/lists`);
  }

  async getList(listId: string): Promise<TrelloList> {
    return this.makeRequest<TrelloList>(`/lists/${listId}`);
  }

  async createList(data: CreateListRequest): Promise<TrelloList> {
    return this.makeRequest<TrelloList>('/lists', {
      method: 'POST',
      body: data,
      useCache: false,
    });
  }

  async updateList(listId: string, data: UpdateListRequest): Promise<TrelloList> {
    return this.makeRequest<TrelloList>(`/lists/${listId}`, {
      method: 'PUT',
      body: data,
      useCache: false,
    });
  }

  // Card operations
  async getListCards(listId: string): Promise<TrelloCard[]> {
    return this.makeRequest<TrelloCard[]>(`/lists/${listId}/cards`);
  }

  async getCard(cardId: string): Promise<TrelloCard> {
    return this.makeRequest<TrelloCard>(`/cards/${cardId}`);
  }

  async getCardWithPowerUps(cardId: string): Promise<TrelloCard & { powerUps?: any }> {
    try {
      // Get card with basic information first
      const card = await this.makeRequest<TrelloCard>(`/cards/${cardId}`);
      
      const powerUps: any = {};
      
      try {
        // Get custom fields for the board
        const boardId = card.idBoard;
        const customFields = await this.makeRequest<any[]>(`/boards/${boardId}/customFields`);
        powerUps.customFields = customFields;
      } catch (error) {
        logger.debug('Custom fields not available or access denied');
        powerUps.customFields = [];
      }
      
      try {
        // Get custom field items for this card
        const customFieldItems = await this.makeRequest<any[]>(`/cards/${cardId}/customFieldItems`);
        powerUps.customFieldItems = customFieldItems;
      } catch (error) {
        logger.debug('Custom field items not available or access denied');
        powerUps.customFieldItems = [];
      }
      
      try {
        // Get plugin data (Power-Ups) - this endpoint might not exist
        const pluginData = await this.makeRequest<any[]>(`/cards/${cardId}/pluginData`);
        powerUps.pluginData = pluginData;
      } catch (error) {
        logger.debug('Plugin data not available or access denied');
        powerUps.pluginData = [];
      }
      
      return {
        ...card,
        powerUps
      };
    } catch (error) {
      logger.error('Error getting card with power-ups:', error);
      throw error;
    }
  }

  async getCardCustomFields(cardId: string): Promise<any[]> {
    return this.makeRequest<any[]>(`/cards/${cardId}/customFieldItems`);
  }

  async getBoardCustomFields(boardId: string): Promise<any[]> {
    return this.makeRequest<any[]>(`/boards/${boardId}/customFields`);
  }

  async getCardPluginData(cardId: string): Promise<any[]> {
    return this.makeRequest<any[]>(`/cards/${cardId}/pluginData`);
  }

  async getCardAttachments(cardId: string): Promise<any[]> {
    return this.makeRequest<any[]>(`/cards/${cardId}/attachments`);
  }

  async getCardActions(cardId: string): Promise<any[]> {
    return this.makeRequest<any[]>(`/cards/${cardId}/actions`);
  }

  async getCardWithAllData(cardId: string): Promise<TrelloCard & { 
    customFields?: any[];
    customFieldItems?: any[];
    pluginData?: any[];
    attachments?: any[];
    actions?: any[];
    stickers?: any[];
    checklists?: any[];
    boardPlugins?: any[];
    cardWithFields?: any;
  }> {
    try {
      // Get basic card info
      const card = await this.makeRequest<TrelloCard>(`/cards/${cardId}`);
      
      const allData: any = { ...card };
      
      // Get custom fields for the board
      try {
        const customFields = await this.makeRequest<any[]>(`/boards/${card.idBoard}/customFields`);
        allData.customFields = customFields;
      } catch (error) {
        logger.debug('Custom fields not available');
        allData.customFields = [];
      }
      
      // Get custom field items for this card
      try {
        const customFieldItems = await this.makeRequest<any[]>(`/cards/${cardId}/customFieldItems`);
        allData.customFieldItems = customFieldItems;
      } catch (error) {
        logger.debug('Custom field items not available');
        allData.customFieldItems = [];
      }
      
      // Get plugin data
      try {
        const pluginData = await this.makeRequest<any[]>(`/cards/${cardId}/pluginData`);
        allData.pluginData = pluginData;
      } catch (error) {
        logger.debug('Plugin data not available');
        allData.pluginData = [];
      }
      
      // Get attachments
      try {
        const attachments = await this.makeRequest<any[]>(`/cards/${cardId}/attachments`);
        allData.attachments = attachments;
      } catch (error) {
        logger.debug('Attachments not available');
        allData.attachments = [];
      }
      
      // Get actions (for Power-Up data)
      try {
        const actions = await this.makeRequest<any[]>(`/cards/${cardId}/actions`);
        allData.actions = actions;
      } catch (error) {
        logger.debug('Actions not available');
        allData.actions = [];
      }

      // Try different Power-Up endpoints
      try {
        // Try to get card with all fields
        const cardWithFields = await this.makeRequest<any>(`/cards/${cardId}?fields=all`);
        if (cardWithFields) {
          allData.cardWithFields = cardWithFields;
        }
      } catch (error) {
        logger.debug('Card with fields not available');
      }

      // Try to get board plugins
      try {
        const boardPlugins = await this.makeRequest<any[]>(`/boards/${card.idBoard}/plugins`);
        allData.boardPlugins = boardPlugins;
      } catch (error) {
        logger.debug('Board plugins not available');
        allData.boardPlugins = [];
      }

      // Try to get card stickers (some Power-Ups use stickers)
      try {
        const stickers = await this.makeRequest<any[]>(`/cards/${cardId}/stickers`);
        allData.stickers = stickers;
      } catch (error) {
        logger.debug('Stickers not available');
        allData.stickers = [];
      }

      // Try to get card checklists (some Power-Ups store data in checklists)
      try {
        const checklists = await this.makeRequest<any[]>(`/cards/${cardId}/checklists`);
        allData.checklists = checklists;
      } catch (error) {
        logger.debug('Checklists not available');
        allData.checklists = [];
      }
      
      return allData;
    } catch (error) {
      logger.error('Error getting card with all data:', error);
      throw error;
    }
  }

  async createCard(data: CreateCardRequest): Promise<TrelloCard> {
    return this.makeRequest<TrelloCard>('/cards', {
      method: 'POST',
      body: data,
      useCache: false,
      priority: 'normal',
    });
  }

  async updateCard(cardId: string, data: UpdateCardRequest): Promise<TrelloCard> {
    return this.makeRequest<TrelloCard>(`/cards/${cardId}`, {
      method: 'PUT',
      body: data,
      useCache: false,
    });
  }

  async deleteCard(cardId: string): Promise<void> {
    await this.makeRequest<void>(`/cards/${cardId}`, {
      method: 'DELETE',
      useCache: false,
    });
  }

  async moveCard(cardId: string, listId: string, position?: string | number): Promise<TrelloCard> {
    const data: any = { idList: listId };
    if (position !== undefined) {
      data.pos = position;
    }
    
    return this.updateCard(cardId, data);
  }

  // Bulk operations
  async bulkCreateCards(request: BulkCreateCardsRequest): Promise<TrelloCard[]> {
    const { cards, idList } = request;
    const createdCards: TrelloCard[] = [];
    
    logger.info(`Creating ${cards.length} cards in bulk`);
    
    // Process in batches to avoid overwhelming the API
    const batchSize = 5;
    for (let i = 0; i < cards.length; i += batchSize) {
      const batch = cards.slice(i, i + batchSize);
      const promises = batch.map(card => 
        this.createCard({ ...card, idList })
      );
      
      const batchResults = await Promise.allSettled(promises);
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          createdCards.push(result.value);
        } else {
          logger.error('Failed to create card in bulk operation', result.reason);
        }
      }
      
      // Small delay between batches
      if (i + batchSize < cards.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    logger.info(`Bulk create completed: ${createdCards.length}/${cards.length} cards created`);
    return createdCards;
  }

  async bulkUpdateCards(request: BulkUpdateCardsRequest): Promise<TrelloCard[]> {
    const { updates } = request;
    const updatedCards: TrelloCard[] = [];
    
    logger.info(`Updating ${updates.length} cards in bulk`);
    
    const batchSize = 5;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      const promises = batch.map(update => 
        this.updateCard(update.id, update.data)
      );
      
      const batchResults = await Promise.allSettled(promises);
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          updatedCards.push(result.value);
        } else {
          logger.error('Failed to update card in bulk operation', result.reason);
        }
      }
      
      if (i + batchSize < updates.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    logger.info(`Bulk update completed: ${updatedCards.length}/${updates.length} cards updated`);
    return updatedCards;
  }

  // Search operations
  async search(request: SearchRequest): Promise<SearchResponse> {
    const params = new URLSearchParams();
    
    Object.entries(request).forEach(([key, value]) => {
      if (value !== undefined) {
        params.append(key, value.toString());
      }
    });

    return this.makeRequest<SearchResponse>(`/search?${params}`);
  }

  async searchCards(query: string, boardIds?: string[]): Promise<TrelloCard[]> {
    const searchRequest: SearchRequest = {
      query,
      modelTypes: 'cards',
      card_fields: 'all',
      card_board: true,
      card_list: true,
      card_members: true,
    };

    if (boardIds && boardIds.length > 0) {
      searchRequest.idBoards = boardIds.join(',');
    }

    const result = await this.search(searchRequest);
    return result.cards;
  }

  // Utility methods
  async testConnection(): Promise<boolean> {
    try {
      await this.makeRequest<any>('/members/me', { useCache: false });
      logger.info('Trello API connection test successful');
      return true;
    } catch (error) {
      logger.error('Trello API connection test failed', error);
      return false;
    }
  }

  getStats(): TrelloClientStats {
    return { ...this.stats };
  }

  clearCache(): void {
    cache.flush();
    logger.info('Trello client cache cleared');
  }

  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageResponseTime: 0,
    };
    logger.info('Trello client stats reset');
  }
}

// Export singleton instance
export const trelloClient = new TrelloClient();
export default trelloClient;
