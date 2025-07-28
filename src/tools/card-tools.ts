import { BaseTool, ToolResult } from './base-tool.js';
import { trelloClient } from '../trello/index.js';



export class GetCardTool extends BaseTool {
  readonly name = 'get_card';
  readonly description = 'Belirli bir kartın detaylı bilgilerini al';
  readonly inputSchema = {
    type: 'object',
    properties: {
      cardId: {
        type: 'string',
        description: 'Kart ID\'si',
      },
    },
    required: ['cardId'],
  };

  async execute(args: any): Promise<ToolResult> {
    try {
      this.validateRequired(args, ['cardId']);

      const card = await trelloClient.getCard(args.cardId);
      
      const lines = [`🎯 **${card.name}** (ID: ${card.id})`];
      
      if (card.desc && card.desc.trim()) {
        lines.push(`📝 **Açıklama:** ${card.desc}`);
      }
      
      if (card.due) {
        const isOverdue = new Date(card.due) < new Date();
        const dueIcon = card.dueComplete ? '✅' : (isOverdue ? '🔴' : '⏰');
        lines.push(`${dueIcon} **Son Tarih:** ${this.formatDate(card.due)}`);
      }
      
      if (card.labels && card.labels.length > 0) {
        const labelNames = card.labels.map((label: any) => label.name || label.color).join(', ');
        lines.push(`🏷️ **Etiketler:** ${labelNames}`);
      }
      
      if (card.members && card.members.length > 0) {
        const memberNames = card.members.map((member: any) => member.fullName || member.username).join(', ');
        lines.push(`👥 **Üyeler:** ${memberNames}`);
      }
      
      if (card.badges) {
        if (card.badges.attachments > 0) {
          lines.push(`📎 **Ekler:** ${card.badges.attachments} dosya`);
        }
        if (card.badges.comments > 0) {
          lines.push(`💬 **Yorumlar:** ${card.badges.comments} yorum`);
        }
        if (card.badges.checkItems > 0) {
          lines.push(`☑️ **Görevler:** ${card.badges.checkItemsChecked}/${card.badges.checkItems} tamamlandı`);
        }
      }
      
      if (card.closed) {
        lines.push(`🗄️ **Durum:** Arşivlenmiş`);
      }
      
      return this.success(lines.join('\n'));

    } catch (error) {
      return this.error(`Kart bilgileri alınırken hata oluştu: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }
}

export class CreateCardTool extends BaseTool {
  readonly name = 'create_card';
  readonly description = 'Yeni bir kart oluştur';
  readonly inputSchema = {
    type: 'object',
    properties: {
      listId: {
        type: 'string',
        description: 'Liste ID\'si',
      },
      name: {
        type: 'string',
        description: 'Kart adı',
      },
      desc: {
        type: 'string',
        description: 'Kart açıklaması',
      },
      due: {
        type: 'string',
        description: 'Son tarih (ISO format)',
      },
      position: {
        type: 'string',
        description: 'Kart pozisyonu (top, bottom, number)',
        default: 'bottom',
      },
    },
    required: ['listId', 'name'],
  };

  async execute(args: any): Promise<ToolResult> {
    try {
      this.validateRequired(args, ['listId', 'name']);

      const cardData = {
        idList: args.listId,
        name: args.name,
        desc: args.desc || '',
        due: args.due || null,
        pos: args.position || 'bottom',
      };

      const card = await trelloClient.createCard(cardData);
      
      const lines = [`✅ **Kart başarıyla oluşturuldu!**`];
      lines.push(`🎯 **Ad:** ${card.name}`);
      lines.push(`🆔 **ID:** ${card.id}`);
      lines.push(`📋 **Liste:** ${card.idList}`);
      
      if (card.desc && card.desc.trim()) {
        lines.push(`📝 **Açıklama:** ${card.desc}`);
      }
      
      if (card.due) {
        lines.push(`⏰ **Son Tarih:** ${this.formatDate(card.due)}`);
      }
      
      return this.success(lines.join('\n'));

    } catch (error) {
      return this.error(`Kart oluşturulurken hata oluştu: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }
}

export class UpdateCardTool extends BaseTool {
  readonly name = 'update_card';
  readonly description = 'Mevcut bir kartı güncelle';
  readonly inputSchema = {
    type: 'object',
    properties: {
      cardId: {
        type: 'string',
        description: 'Kart ID\'si',
      },
      name: {
        type: 'string',
        description: 'Yeni kart adı',
      },
      desc: {
        type: 'string',
        description: 'Yeni kart açıklaması',
      },
      due: {
        type: 'string',
        description: 'Yeni son tarih (ISO format)',
      },
      dueComplete: {
        type: 'boolean',
        description: 'Son tarih tamamlandı mı?',
      },
    },
    required: ['cardId'],
  };

  async execute(args: any): Promise<ToolResult> {
    try {
      this.validateRequired(args, ['cardId']);

      const updateData: any = {};
      
      if (args.name) updateData.name = args.name;
      if (args.desc !== undefined) updateData.desc = args.desc;
      if (args.due !== undefined) updateData.due = args.due;
      if (args.dueComplete !== undefined) updateData.dueComplete = args.dueComplete;

      const card = await trelloClient.updateCard(args.cardId, updateData);
      
      const lines = [`✅ **Kart başarıyla güncellendi!**`];
      lines.push(`🎯 **Ad:** ${card.name}`);
      lines.push(`🆔 **ID:** ${card.id}`);
      
      if (card.desc && card.desc.trim()) {
        lines.push(`📝 **Açıklama:** ${card.desc}`);
      }
      
      if (card.due) {
        const isOverdue = new Date(card.due) < new Date();
        const dueIcon = card.dueComplete ? '✅' : (isOverdue ? '🔴' : '⏰');
        lines.push(`${dueIcon} **Son Tarih:** ${this.formatDate(card.due)}`);
      }
      
      return this.success(lines.join('\n'));

    } catch (error) {
      return this.error(`Kart güncellenirken hata oluştu: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }
}

export class MoveCardTool extends BaseTool {
  readonly name = 'move_card';
  readonly description = 'Kartı başka bir listeye taşı';
  readonly inputSchema = {
    type: 'object',
    properties: {
      cardId: {
        type: 'string',
        description: 'Kart ID\'si',
      },
      listId: {
        type: 'string',
        description: 'Hedef liste ID\'si',
      },
      position: {
        type: 'string',
        description: 'Pozisyon (top, bottom, number)',
        default: 'bottom',
      },
    },
    required: ['cardId', 'listId'],
  };

  async execute(args: any): Promise<ToolResult> {
    try {
      this.validateRequired(args, ['cardId', 'listId']);

      const card = await trelloClient.moveCard(args.cardId, args.listId, args.position);
      
      const lines = [`✅ **Kart başarıyla taşındı!**`];
      lines.push(`🎯 **Ad:** ${card.name}`);
      lines.push(`🆔 **ID:** ${card.id}`);
      lines.push(`📋 **Yeni Liste:** ${card.idList}`);
      
      return this.success(lines.join('\n'));

    } catch (error) {
      return this.error(`Kart taşınırken hata oluştu: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }
}

export class DeleteCardTool extends BaseTool {
  readonly name = 'delete_card';
  readonly description = 'Bir kartı kalıcı olarak sil';
  readonly inputSchema = {
    type: 'object',
    properties: {
      cardId: {
        type: 'string',
        description: 'Kart ID\'si',
      },
    },
    required: ['cardId'],
  };

  async execute(args: any): Promise<ToolResult> {
    try {
      this.validateRequired(args, ['cardId']);

      await trelloClient.deleteCard(args.cardId);
      
      return this.success(`✅ Kart başarıyla silindi! (ID: ${args.cardId})`);

    } catch (error) {
      return this.error(`Kart silinirken hata oluştu: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }
}

export class ArchiveCardTool extends BaseTool {
  readonly name = 'archive_card';
  readonly description = 'Bir kartı arşivle veya arşivden çıkar';
  readonly inputSchema = {
    type: 'object',
    properties: {
      cardId: {
        type: 'string',
        description: 'Kart ID\'si',
      },
      archive: {
        type: 'boolean',
        description: 'Arşivle (true) veya arşivden çıkar (false)',
        default: true,
      },
    },
    required: ['cardId'],
  };

  async execute(args: any): Promise<ToolResult> {
    try {
      this.validateRequired(args, ['cardId']);

      const card = await trelloClient.updateCard(args.cardId, { closed: args.archive });
      
      const action = args.archive ? 'arşivlendi' : 'arşivden çıkarıldı';
      const lines = [`✅ **Kart başarıyla ${action}!**`];
      lines.push(`🎯 **Ad:** ${card.name}`);
      lines.push(`🆔 **ID:** ${card.id}`);
      lines.push(`🗄️ **Durum:** ${card.closed ? 'Arşivlenmiş' : 'Aktif'}`);
      
      return this.success(lines.join('\n'));

    } catch (error) {
      return this.error(`Kart arşivlenirken hata oluştu: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }
}

// Export all card tools
export const cardTools = [
  new GetCardTool(),
  new CreateCardTool(),
  new UpdateCardTool(),
  new MoveCardTool(),
  new DeleteCardTool(),
  new ArchiveCardTool(),
]; 