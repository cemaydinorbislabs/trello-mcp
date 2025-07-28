import { BaseTool, ToolResult } from './base-tool.js';
import { trelloClient } from '../trello/client.js';
import { BulkCreateCardsRequest, CreateCardRequest } from '../trello/types.js';

export class BulkCreateCardsTool extends BaseTool {
  readonly name = 'bulk_create_cards';
  readonly description = 'Çoklu kart oluştur (aynı listede birden fazla kart)';
  readonly inputSchema = {
    type: 'object',
    properties: {
      listId: {
        type: 'string',
        description: 'Kartların ekleneceği liste ID\'si',
      },
      cards: {
        type: 'array',
        description: 'Oluşturulacak kartların listesi',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Kart adı',
            },
            description: {
              type: 'string',
              description: 'Kart açıklaması (isteğe bağlı)',
            },
            dueDate: {
              type: 'string',
              description: 'Son tarih (ISO 8601 formatında)',
            },
            position: {
              type: 'string',
              description: 'Kart pozisyonu',
            },
            memberIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Üye ID\'leri',
            },
            labelIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Etiket ID\'leri',
            },
          },
          required: ['name'],
        },
      },
    },
    required: ['listId', 'cards'],
  };

  async execute(args: any): Promise<ToolResult> {
    try {
      this.validateRequired(args, ['listId', 'cards']);

      if (!Array.isArray(args.cards) || args.cards.length === 0) {
        return this.error('En az bir kart bilgisi gerekli');
      }

      if (args.cards.length > 50) {
        return this.error('Tek seferde en fazla 50 kart oluşturabilirsiniz');
      }

      // Validate each card
      for (let i = 0; i < args.cards.length; i++) {
        const card = args.cards[i];
        if (!card.name || !card.name.trim()) {
          return this.error(`Kart ${i + 1}: Kart adı gerekli`);
        }
        
        if (card.dueDate) {
          const dueDate = new Date(card.dueDate);
          if (isNaN(dueDate.getTime())) {
            return this.error(`Kart ${i + 1}: Geçersiz tarih formatı`);
          }
        }
      }

      // Prepare cards data
      const cardsData: Omit<CreateCardRequest, 'idList'>[] = args.cards.map((card: any) => {
        const cardData: Omit<CreateCardRequest, 'idList'> = {
          name: card.name.trim(),
        };

        if (card.description && card.description.trim()) {
          cardData.desc = card.description.trim();
        }

        if (card.dueDate) {
          cardData.due = card.dueDate;
        }

        if (card.position) {
          cardData.pos = card.position;
        }

        if (card.memberIds && card.memberIds.length > 0) {
          cardData.idMembers = card.memberIds;
        }

        if (card.labelIds && card.labelIds.length > 0) {
          cardData.idLabels = card.labelIds;
        }

        return cardData;
      });

      const bulkRequest: BulkCreateCardsRequest = {
        idList: args.listId,
        cards: cardsData,
      };

      // Execute bulk creation
      const createdCards = await trelloClient.bulkCreateCards(bulkRequest);

      const successCount = createdCards.length;
      const failedCount = args.cards.length - successCount;

      const summary = this.createSummary('📦 Bulk Kart Oluşturma Sonucu', {
        'Başarılı': successCount,
        'Başarısız': failedCount,
        'Toplam': args.cards.length,
        'Başarı Oranı': `${Math.round((successCount / args.cards.length) * 100)}%`,
      });

      let resultMessage = summary;

      if (successCount > 0) {
        resultMessage += '\n\n✅ Oluşturulan Kartlar:\n';
        createdCards.slice(0, 10).forEach((card, index) => {
          resultMessage += `${index + 1}. ${card.name} (${card.id})\n`;
        });

        if (createdCards.length > 10) {
          resultMessage += `... ve ${createdCards.length - 10} kart daha\n`;
        }
      }

      if (failedCount > 0) {
        resultMessage += `\n⚠️ ${failedCount} kart oluşturulamadı. Loglarda detayları kontrol edin.`;
      }

      return this.success(resultMessage);

    } catch (error) {
      return this.error(`Bulk kart oluşturma hatası: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }
}

export class BulkMoveCardsTool extends BaseTool {
  readonly name = 'bulk_move_cards';
  readonly description = 'Çoklu kart taşıma (birden fazla kartı aynı listeye taşı)';
  readonly inputSchema = {
    type: 'object',
    properties: {
      cardIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Taşınacak kart ID\'leri',
      },
      targetListId: {
        type: 'string',
        description: 'Hedef liste ID\'si',
      },
      startPosition: {
        type: 'string',
        description: 'Başlangıç pozisyonu ("top", "bottom" veya sayısal değer)',
        default: 'bottom',
      },
    },
    required: ['cardIds', 'targetListId'],
  };

  async execute(args: any): Promise<ToolResult> {
    try {
      this.validateRequired(args, ['cardIds', 'targetListId']);

      if (!Array.isArray(args.cardIds) || args.cardIds.length === 0) {
        return this.error('En az bir kart ID\'si gerekli');
      }

      if (args.cardIds.length > 50) {
        return this.error('Tek seferde en fazla 50 kart taşıyabilirsiniz');
      }

      const startPosition = args.startPosition || 'bottom';
      const movedCards: any[] = [];
      const failedCards: any[] = [];

      // Move cards in batches
      const batchSize = 5;
      for (let i = 0; i < args.cardIds.length; i += batchSize) {
        const batch = args.cardIds.slice(i, i + batchSize);
        const promises = batch.map((cardId: string) => 
          trelloClient.moveCard(cardId, args.targetListId, startPosition)
        );

        const batchResults = await Promise.allSettled(promises);
        
        batchResults.forEach((result, index) => {
          const cardId = batch[index];
          if (result.status === 'fulfilled') {
            movedCards.push(result.value);
          } else {
            failedCards.push({
              cardId,
              error: result.reason?.message || 'Bilinmeyen hata',
            });
          }
        });

        // Small delay between batches
        if (i + batchSize < args.cardIds.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const successCount = movedCards.length;
      const failedCount = failedCards.length;

      const summary = this.createSummary('📦 Bulk Kart Taşıma Sonucu', {
        'Başarılı': successCount,
        'Başarısız': failedCount,
        'Toplam': args.cardIds.length,
        'Hedef Liste': args.targetListId,
        'Başarı Oranı': `${Math.round((successCount / args.cardIds.length) * 100)}%`,
      });

      let resultMessage = summary;

      if (successCount > 0) {
        resultMessage += '\n\n✅ Taşınan Kartlar:\n';
        movedCards.slice(0, 10).forEach((card, index) => {
          resultMessage += `${index + 1}. ${card.name} (${card.id})\n`;
        });

        if (movedCards.length > 10) {
          resultMessage += `... ve ${movedCards.length - 10} kart daha\n`;
        }
      }

      if (failedCards.length > 0) {
        resultMessage += '\n\n❌ Taşınamayan Kartlar:\n';
        failedCards.forEach((failed, index) => {
          resultMessage += `${index + 1}. ${failed.cardId}: ${failed.error}\n`;
        });
      }

      return this.success(resultMessage);

    } catch (error) {
      return this.error(`Bulk kart taşıma hatası: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }
}

export class BulkArchiveCardsTool extends BaseTool {
  readonly name = 'bulk_archive_cards';
  readonly description = 'Çoklu kart arşivleme (birden fazla kartı aynı anda arşivle/aktifleştir)';
  readonly inputSchema = {
    type: 'object',
    properties: {
      cardIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'İşlem yapılacak kart ID\'leri',
      },
      archive: {
        type: 'boolean',
        description: 'true: arşivle, false: arşivden çıkar (varsayılan: true)',
        default: true,
      },
    },
    required: ['cardIds'],
  };

  async execute(args: any): Promise<ToolResult> {
    try {
      this.validateRequired(args, ['cardIds']);

      if (!Array.isArray(args.cardIds) || args.cardIds.length === 0) {
        return this.error('En az bir kart ID\'si gerekli');
      }

      if (args.cardIds.length > 50) {
        return this.error('Tek seferde en fazla 50 kartla işlem yapabilirsiniz');
      }

      const archive = args.archive !== false;
      const processedCards: any[] = [];
      const failedCards: any[] = [];

      // Process cards in batches
      const batchSize = 5;
      for (let i = 0; i < args.cardIds.length; i += batchSize) {
        const batch = args.cardIds.slice(i, i + batchSize);
        const promises = batch.map((cardId: string) => 
          trelloClient.updateCard(cardId, { closed: archive })
        );

        const batchResults = await Promise.allSettled(promises);
        
        batchResults.forEach((result, index) => {
          const cardId = batch[index];
          if (result.status === 'fulfilled') {
            processedCards.push(result.value);
          } else {
            failedCards.push({
              cardId,
              error: result.reason?.message || 'Bilinmeyen hata',
            });
          }
        });

        // Small delay between batches
        if (i + batchSize < args.cardIds.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const successCount = processedCards.length;
      const failedCount = failedCards.length;
      const action = archive ? 'Arşivleme' : 'Aktifleştirme';
      const emoji = archive ? '🗄️' : '✅';

      const summary = this.createSummary(`📦 Bulk Kart ${action} Sonucu`, {
        'Başarılı': successCount,
        'Başarısız': failedCount,
        'Toplam': args.cardIds.length,
        'İşlem': action,
        'Başarı Oranı': `${Math.round((successCount / args.cardIds.length) * 100)}%`,
      });

      let resultMessage = summary;

      if (successCount > 0) {
        resultMessage += `\n\n${emoji} İşlem Yapılan Kartlar:\n`;
        processedCards.slice(0, 10).forEach((card, index) => {
          resultMessage += `${index + 1}. ${card.name} (${card.id})\n`;
        });

        if (processedCards.length > 10) {
          resultMessage += `... ve ${processedCards.length - 10} kart daha\n`;
        }
      }

      if (failedCards.length > 0) {
        resultMessage += '\n\n❌ İşlem Yapılamayan Kartlar:\n';
        failedCards.forEach((failed, index) => {
          resultMessage += `${index + 1}. ${failed.cardId}: ${failed.error}\n`;
        });
      }

      return this.success(resultMessage);

    } catch (error) {
      return this.error(`Bulk kart arşivleme hatası: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }
}

// Export all bulk tools
export const bulkTools = [
  new BulkCreateCardsTool(),
  new BulkMoveCardsTool(),
  new BulkArchiveCardsTool(),
];
