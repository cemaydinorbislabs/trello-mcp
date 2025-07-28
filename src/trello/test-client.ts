#!/usr/bin/env node

/**
 * Simple test script for Trello client
 * Usage: npm run test:trello
 */

import { trelloClient } from './client.js';
import { logger } from '../core/logger.js';

async function testTrelloClient() {
  logger.info('Testing Trello client...');

  try {
    // Test connection
    logger.info('Testing API connection...');
    const isConnected = await trelloClient.testConnection();
    
    if (!isConnected) {
      logger.error('Failed to connect to Trello API');
      process.exit(1);
    }

    // Get boards
    logger.info('Fetching boards...');
    const boards = await trelloClient.getBoards();
    logger.info(`Found ${boards.length} boards`);
    
    if (boards.length > 0) {
      const firstBoard = boards[0];
      logger.info(`First board: ${firstBoard.name} (${firstBoard.id})`);

      // Get lists from first board
      logger.info('Fetching lists from first board...');
      const lists = await trelloClient.getBoardLists(firstBoard.id);
      logger.info(`Found ${lists.length} lists`);

      if (lists.length > 0) {
        const firstList = lists[0];
        logger.info(`First list: ${firstList.name} (${firstList.id})`);

        // Get cards from first list
        logger.info('Fetching cards from first list...');
        const cards = await trelloClient.getListCards(firstList.id);
        logger.info(`Found ${cards.length} cards`);

        if (cards.length > 0) {
          const firstCard = cards[0];
          logger.info(`First card: ${firstCard.name} (${firstCard.id})`);
        }
      }
    }

    // Test search
    logger.info('Testing search functionality...');
    const searchResults = await trelloClient.searchCards('test');
    logger.info(`Search results: ${searchResults.length} cards found`);

    // Show stats
    const stats = trelloClient.getStats();
    logger.info('Client stats:', stats);

    logger.info('Trello client test completed successfully!');

  } catch (error) {
    logger.error('Trello client test failed:', error);
    process.exit(1);
  }
}

// Run test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testTrelloClient();
}

export { testTrelloClient };
