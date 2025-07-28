import { BaseTool, ToolResult } from './base-tool.js';
import { trelloClient } from '../trello/index.js';
import { cache } from '../core/memory-cache.js';

export class GetListCardsWithPowerUpsOptimizedTool extends BaseTool {
  readonly name = 'get_list_cards_powerups';
  readonly description = 'Listedeki tüm kartları Power-Up verileriyle birlikte getir (optimize edilmiş)';
  readonly inputSchema = {
    type: 'object',
    properties: {
      listId: {
        type: 'string',
        description: 'Liste ID\'si',
      },
      includeArchived: {
        type: 'boolean',
        description: 'Arşivlenmiş kartları da dahil et (varsayılan: false)',
        default: false,
      },
      includePowerUps: {
        type: 'boolean',
        description: 'Power-Up verilerini dahil et (varsayılan: true)',
        default: true,
      },
      limit: {
        type: 'number',
        description: 'Maksimum kart sayısı (varsayılan: 20)',
        default: 20,
      },
      fields: {
        type: 'string',
        description: 'Hangi kart field\'larını getireceği (all, name,desc,due,labels vb.)',
        default: 'all',
      },
      useCache: {
        type: 'boolean',
        description: 'Cache kullan (varsayılan: true)',
        default: true,
      },
    },
    required: ['listId'],
  };

  async execute(args: any): Promise<ToolResult> {
    try {
      this.validateRequired(args, ['listId']);

      // Cache key oluştur (limit hariç tutulur çünkü her limit için ayrı cache istemiyoruz)
      const cacheArgs = { ...args };
      delete cacheArgs.limit;
      const cacheKey = `optimized_cards_${args.listId}_${JSON.stringify(cacheArgs)}`;
      
      // Cache'den kontrol et
      let cachedCards: any[] = [];
      if (args.useCache !== false) {
        const cached = cache.get<any[]>(cacheKey);
        if (cached) {
          cachedCards = cached;
        }
      }

      let cards: any[] = [];
      
      // Cache'den kartları al veya API'den getir
      if (cachedCards.length > 0) {
        cards = cachedCards;
      } else {
        // 1. Optimize edilmiş şekilde kartları getir
        cards = await trelloClient.getListCardsOptimized(args.listId, {
          fields: args.fields || 'all',
          includeCustomFields: args.includePowerUps,
          includePluginData: args.includePowerUps,
          includeMembers: true,
          includeLabels: true,
        });
        
        // Cache'e kaydet (limit hariç)
        if (args.useCache !== false) {
          cache.set(cacheKey, cards, 300); // 5 dakika cache
        }
      }
      
      let filteredCards = cards;

      // Filter by archived status
      if (!args.includeArchived) {
        filteredCards = filteredCards.filter(card => !card.closed);
      }

      // Apply limit
      const limit = args.limit || 20;
      const hasMore = filteredCards.length > limit;
      filteredCards = filteredCards.slice(0, limit);

      if (filteredCards.length === 0) {
        return this.success('Bu listede hiç kart bulunamadı.');
      }

      // 2. Board'daki custom field tanımlarını cache'den al veya getir
      let boardCustomFields: any[] = [];
      if (args.includePowerUps && filteredCards.length > 0) {
        const boardId = filteredCards[0].idBoard;
        const boardCacheKey = `board_custom_fields_${boardId}`;
        
        boardCustomFields = await cache.getOrSet(boardCacheKey, async () => {
          try {
            return await trelloClient.getBoardCustomFields(boardId);
          } catch (error) {
            return [];
          }
        }, { ttl: 600 }); // 10 dakika cache
      }

      const lines = [`🚀 **Optimize Edilmiş Liste Kartları** (${filteredCards.length} adet${hasMore ? `, ${limit} tanesi gösteriliyor` : ''})`];
      lines.push(`📋 **Liste ID:** ${args.listId}`);
      lines.push(`⚡ **Cache:** ${args.useCache !== false ? 'Aktif' : 'Devre dışı'}`);
      lines.push(`🔌 **Power-Ups:** ${args.includePowerUps ? 'Aktif' : 'Devre dışı'}`);
      lines.push('');

      for (let i = 0; i < filteredCards.length; i++) {
        const card = filteredCards[i];
        
        // Kart başlığı
        const cardNumber = i + 1;
        const archivedIcon = card.closed ? '🗄️ ' : '';
        lines.push(`${cardNumber}. ${archivedIcon}**${card.name}** (ID: ${card.id})`);
        
        // Temel bilgiler
        if (card.desc && card.desc.trim()) {
          lines.push(`   📝 ${this.truncateText(card.desc, 80)}`);
        }
        
        if (card.due) {
          const isOverdue = new Date(card.due) < new Date();
          const dueIcon = card.dueComplete ? '✅' : (isOverdue ? '🔴' : '⏰');
          lines.push(`   ${dueIcon} Son tarih: ${this.formatDate(card.due)}`);
        }
        
        if (card.labels && card.labels.length > 0) {
          const labelNames = card.labels.map((label: any) => label.name || label.color).join(', ');
          lines.push(`   🏷️ Etiketler: ${labelNames}`);
        }
        
        if (card.members && card.members.length > 0) {
          const memberNames = card.members.map((member: any) => member.fullName || member.username).join(', ');
          lines.push(`   👥 Üyeler: ${memberNames}`);
        }
        
        if (card.badges) {
          if (card.badges.attachments > 0) {
            lines.push(`   📎 ${card.badges.attachments} ek dosya`);
          }
          if (card.badges.comments > 0) {
            lines.push(`   💬 ${card.badges.comments} yorum`);
          }
          if (card.badges.checkItems > 0) {
            lines.push(`   ☑️ ${card.badges.checkItemsChecked}/${card.badges.checkItems} görev tamamlandı`);
          }
        }

        // Power-Up verilerini işle
        if (args.includePowerUps) {
          const powerUpData = this.processPowerUpData(card, boardCustomFields);
          if (powerUpData.length > 0) {
            lines.push(`   🔌 **Power-Up Verileri:**`);
            lines.push(...powerUpData.map(data => `     ${data}`));
          } else {
            lines.push(`   🔌 **Power-Up Verileri:** Mevcut değil`);
          }
        }
        
        lines.push(''); // Kartlar arası boşluk
      }

      const result = lines.join('\n');
      return this.success(result);

    } catch (error) {
      return this.error(`Kartlar alınırken hata oluştu: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }

  /**
   * Power-Up verilerini işle ve formatla
   */
  private processPowerUpData(card: any, boardCustomFields: any[]): string[] {
    const powerUpData: string[] = [];

    // Custom Fields işle
    if (card.customFieldItems && card.customFieldItems.length > 0) {
      for (const fieldItem of card.customFieldItems) {
        const fieldDef = boardCustomFields.find(f => f.id === fieldItem.idCustomField);
        if (fieldDef) {
          const value = this.extractCustomFieldValue(fieldItem);
          
          // Story Points için özel kontrol
          if (this.isStoryPointsField(fieldDef.name)) {
            powerUpData.push(`🎯 **Story Points:** ${value}`);
          } else if (this.isEpicField(fieldDef.name)) {
            powerUpData.push(`📋 **Epic:** ${value}`);
          } else if (this.isSprintField(fieldDef.name)) {
            powerUpData.push(`🏃 **Sprint:** ${value}`);
          } else {
            powerUpData.push(`• ${fieldDef.name}: ${value}`);
          }
        }
      }
    }

    // Plugin Data işle
    if (card.pluginData && card.pluginData.length > 0) {
      for (const plugin of card.pluginData) {
        try {
          const data = JSON.parse(plugin.value);
          
          // Scrum/Agile specific data
          if (data.storyPoints || data.points || data.estimate || data.size) {
            const storyPoints = data.storyPoints || data.points || data.estimate || data.size;
            powerUpData.push(`🎯 **Story Points:** ${storyPoints}`);
            
            // Remaining hesaplama
            const spent = data.spent || 0;
            const remaining = storyPoints - spent;
            if (remaining >= 0) {
              powerUpData.push(`⏳ **Remaining:** ${remaining} (${storyPoints} - ${spent})`);
            }
          }
          
          if (data.spent !== undefined) {
            powerUpData.push(`⏱️ **Spent:** ${data.spent}`);
          }
          
          if (data.epic || data.sprint) {
            if (data.epic) powerUpData.push(`📋 **Epic:** ${data.epic}`);
            if (data.sprint) powerUpData.push(`🏃 **Sprint:** ${data.sprint}`);
          }
          
          // Epic ve Sprint için daha geniş arama
          const epicKeys = ['epicName', 'epicId', 'epicTitle'];
          const sprintKeys = ['sprintName', 'sprintId', 'sprintTitle', 'iteration'];
          
          for (const key of epicKeys) {
            if (data[key] && !data.epic) {
              powerUpData.push(`📋 **Epic:** ${data[key]}`);
              break;
            }
          }
          
          for (const key of sprintKeys) {
            if (data[key] && !data.sprint) {
              powerUpData.push(`🏃 **Sprint:** ${data[key]}`);
              break;
            }
          }
          
        } catch (e) {
          // Plugin data parse edilemezse atla
        }
      }
    }

    return powerUpData;
  }

  /**
   * Custom Field değerini çıkar
   */
  private extractCustomFieldValue(fieldItem: any): string {
    if (!fieldItem.value) return '';
    
    switch (fieldItem.value.type) {
      case 'text':
        return fieldItem.value.text || '';
      case 'number':
        return fieldItem.value.number?.toString() || '';
      case 'checkbox':
        return fieldItem.value.checked ? '✅' : '❌';
      case 'list':
        return fieldItem.value.idValue || '';
      default:
        return JSON.stringify(fieldItem.value);
    }
  }

  /**
   * Story Points field olup olmadığını kontrol et
   */
  private isStoryPointsField(name: string): boolean {
    if (!name) return false;
    const lowerName = name.toLowerCase();
    return lowerName.includes('story point') || 
           lowerName.includes('size') || 
           lowerName.includes('estimate') ||
           lowerName.includes('points');
  }

  /**
   * Epic field olup olmadığını kontrol et
   */
  private isEpicField(name: string): boolean {
    if (!name) return false;
    return name.toLowerCase().includes('epic');
  }

  /**
   * Sprint field olup olmadığını kontrol et
   */
  private isSprintField(name: string): boolean {
    if (!name) return false;
    const lowerName = name.toLowerCase();
    return lowerName.includes('sprint') || lowerName.includes('iteration');
  }


}

// Export the optimized tool
export const optimizedCardTools = [
  new GetListCardsWithPowerUpsOptimizedTool(),
];
