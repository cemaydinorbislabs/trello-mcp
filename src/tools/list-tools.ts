import { BaseTool, ToolResult } from './base-tool.js';
import { trelloClient } from '../trello/client.js';
import { CreateListRequest, UpdateListRequest } from '../trello/types.js';

export class GetListTool extends BaseTool {
  readonly name = 'get_list';
  readonly description = 'Belirli bir listenin detaylarını al';
  readonly inputSchema = {
    type: 'object',
    properties: {
      listId: {
        type: 'string',
        description: 'Liste ID\'si',
      },
    },
    required: ['listId'],
  };

  async execute(args: any): Promise<ToolResult> {
    try {
      this.validateRequired(args, ['listId']);

      const list = await trelloClient.getList(args.listId);

      const listInfo = [
        `📝 **${list.name}**`,
        `ID: ${list.id}`,
        `Pano ID: ${list.idBoard}`,
        `Pozisyon: ${list.pos}`,
        `Durum: ${list.closed ? '🗄️ Arşivlenmiş' : '✅ Aktif'}`,
        `Abone: ${list.subscribed ? 'Evet' : 'Hayır'}`,
      ].join('\n');

      return this.success(listInfo);

    } catch (error) {
      return this.error(`Liste bilgileri alınırken hata oluştu: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }
}

export class CreateListTool extends BaseTool {
  readonly name = 'create_list';
  readonly description = 'Yeni bir liste oluştur';
  readonly inputSchema = {
    type: 'object',
    properties: {
      boardId: {
        type: 'string',
        description: 'Listenin ekleneceği pano ID\'si',
      },
      name: {
        type: 'string',
        description: 'Liste adı',
      },
      position: {
        type: 'string',
        description: 'Liste pozisyonu ("top", "bottom" veya sayısal değer)',
        default: 'bottom',
      },
    },
    required: ['boardId', 'name'],
  };

  async execute(args: any): Promise<ToolResult> {
    try {
      this.validateRequired(args, ['boardId', 'name']);

      const createData: CreateListRequest = {
        name: args.name.trim(),
        idBoard: args.boardId,
      };

      if (args.position) {
        createData.pos = args.position;
      }

      const newList = await trelloClient.createList(createData);

      const successMessage = [
        `✅ Liste başarıyla oluşturuldu!`,
        ``,
        `📝 **${newList.name}**`,
        `ID: ${newList.id}`,
        `Pano ID: ${newList.idBoard}`,
        `Pozisyon: ${newList.pos}`,
      ].join('\n');

      return this.success(successMessage);

    } catch (error) {
      return this.error(`Liste oluşturulurken hata oluştu: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }
}

export class UpdateListTool extends BaseTool {
  readonly name = 'update_list';
  readonly description = 'Mevcut bir listeyi güncelle';
  readonly inputSchema = {
    type: 'object',
    properties: {
      listId: {
        type: 'string',
        description: 'Güncellenecek liste ID\'si',
      },
      name: {
        type: 'string',
        description: 'Yeni liste adı (isteğe bağlı)',
      },
      closed: {
        type: 'boolean',
        description: 'Liste arşivleme durumu (isteğe bağlı)',
      },
      position: {
        type: 'string',
        description: 'Yeni pozisyon ("top", "bottom" veya sayısal değer)',
      },
    },
    required: ['listId'],
  };

  async execute(args: any): Promise<ToolResult> {
    try {
      this.validateRequired(args, ['listId']);

      // Get current list info
      const currentList = await trelloClient.getList(args.listId);

      const updateData: UpdateListRequest = {};
      const changes: string[] = [];

      if (args.name && args.name.trim() !== currentList.name) {
        updateData.name = args.name.trim();
        changes.push(`Ad: "${currentList.name}" → "${updateData.name}"`);
      }

      if (args.closed !== undefined && args.closed !== currentList.closed) {
        updateData.closed = args.closed;
        changes.push(`Durum: ${currentList.closed ? 'Arşivlenmiş' : 'Aktif'} → ${args.closed ? 'Arşivlenmiş' : 'Aktif'}`);
      }

      if (args.position !== undefined) {
        updateData.pos = args.position;
        changes.push(`Pozisyon: ${currentList.pos} → ${args.position}`);
      }

      if (changes.length === 0) {
        return this.success('Hiç değişiklik yapılmadı.');
      }

      const updatedList = await trelloClient.updateList(args.listId, updateData);

      const successMessage = [
        `✅ Liste başarıyla güncellendi!`,
        ``,
        `📝 **${updatedList.name}**`,
        `ID: ${updatedList.id}`,
        ``,
        `🔄 Değişiklikler:`,
        ...changes.map(change => `• ${change}`),
      ].join('\n');

      return this.success(successMessage);

    } catch (error) {
      return this.error(`Liste güncellenirken hata oluştu: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }
}

export class ArchiveListTool extends BaseTool {
  readonly name = 'archive_list';
  readonly description = 'Bir listeyi arşivle veya arşivden çıkar';
  readonly inputSchema = {
    type: 'object',
    properties: {
      listId: {
        type: 'string',
        description: 'Liste ID\'si',
      },
      archive: {
        type: 'boolean',
        description: 'true: arşivle, false: arşivden çıkar (varsayılan: true)',
        default: true,
      },
    },
    required: ['listId'],
  };

  async execute(args: any): Promise<ToolResult> {
    try {
      this.validateRequired(args, ['listId']);

      const archive = args.archive !== false; // Default to true
      
      const updatedList = await trelloClient.updateList(args.listId, {
        closed: archive,
      });

      const action = archive ? 'arşivlendi' : 'arşivden çıkarıldı';
      const emoji = archive ? '🗄️' : '✅';

      const successMessage = [
        `${emoji} Liste başarıyla ${action}!`,
        ``,
        `📝 **${updatedList.name}**`,
        `ID: ${updatedList.id}`,
        `Durum: ${updatedList.closed ? 'Arşivlenmiş' : 'Aktif'}`,
      ].join('\n');

      return this.success(successMessage);

    } catch (error) {
      return this.error(`Liste arşivlenirken hata oluştu: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }
}

export class MoveListTool extends BaseTool {
  readonly name = 'move_list';
  readonly description = 'Bir listeyi başka pozisyona taşı';
  readonly inputSchema = {
    type: 'object',
    properties: {
      listId: {
        type: 'string',
        description: 'Taşınacak liste ID\'si',
      },
      position: {
        type: 'string',
        description: 'Hedef pozisyon ("top", "bottom" veya sayısal değer)',
      },
      boardId: {
        type: 'string',
        description: 'Hedef pano ID\'si (farklı panoya taşımak için)',
      },
    },
    required: ['listId', 'position'],
  };

  async execute(args: any): Promise<ToolResult> {
    try {
      this.validateRequired(args, ['listId', 'position']);

      const currentList = await trelloClient.getList(args.listId);

      const updateData: UpdateListRequest = {
        pos: args.position,
      };

      // If moving to different board
      if (args.boardId && args.boardId !== currentList.idBoard) {
        updateData.idBoard = args.boardId;
      }

      const updatedList = await trelloClient.updateList(args.listId, updateData);

      const successMessage = [
        `✅ Liste başarıyla taşındı!`,
        ``,
        `📝 **${updatedList.name}**`,
        `ID: ${updatedList.id}`,
        `Eski pozisyon: ${currentList.pos}`,
        `Yeni pozisyon: ${updatedList.pos}`,
        args.boardId && args.boardId !== currentList.idBoard 
          ? `Pano değişti: ${currentList.idBoard} → ${updatedList.idBoard}`
          : '',
      ].filter(line => line !== '').join('\n');

      return this.success(successMessage);

    } catch (error) {
      return this.error(`Liste taşınırken hata oluştu: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }
}

export class GetListCardCountTool extends BaseTool {
  readonly name = 'get_list_card_count';
  readonly description = 'Bir listedeki kart sayısını al';
  readonly inputSchema = {
    type: 'object',
    properties: {
      listId: {
        type: 'string',
        description: 'Liste ID\'si',
      },
      includeArchived: {
        type: 'boolean',
        description: 'Arşivlenmiş kartları da say (varsayılan: false)',
        default: false,
      },
    },
    required: ['listId'],
  };

  async execute(args: any): Promise<ToolResult> {
    try {
      this.validateRequired(args, ['listId']);

      const [list, cards] = await Promise.all([
        trelloClient.getList(args.listId),
        trelloClient.getListCards(args.listId),
      ]);

      const activeCards = cards.filter(card => !card.closed);
      const archivedCards = cards.filter(card => card.closed);

      const includeArchived = args.includeArchived === true;
      const totalCount = includeArchived ? cards.length : activeCards.length;

      const countInfo = [
        `📊 **${list.name}** - Kart Sayısı`,
        ``,
        `Aktif kartlar: ${activeCards.length}`,
        `Arşivlenmiş kartlar: ${archivedCards.length}`,
        `Toplam kartlar: ${cards.length}`,
        ``,
        `${includeArchived ? '📋 Toplam' : '✅ Aktif'} kart sayısı: **${totalCount}**`,
      ].join('\n');

      return this.success(countInfo);

    } catch (error) {
      return this.error(`Kart sayısı alınırken hata oluştu: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }
}

// Export all list tools
export const listTools = [
  new GetListTool(),
  new CreateListTool(),
  new UpdateListTool(),
  new ArchiveListTool(),
  new MoveListTool(),
  new GetListCardCountTool(),
];
