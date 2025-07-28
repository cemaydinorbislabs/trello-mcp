import { BaseTool, ToolResult } from './base-tool.js';
import { trelloClient } from '../trello/client.js';
import { TrelloBoard, TrelloList } from '../trello/types.js';

export class GetBoardsTool extends BaseTool {
  readonly name = 'get_boards';
  readonly description = 'Kullanıcının Trello panolarını listele';
  readonly inputSchema = {
    type: 'object',
    properties: {
      includeArchived: {
        type: 'boolean',
        description: 'Arşivlenmiş panoları da dahil et (varsayılan: false)',
        default: false,
      },
      filter: {
        type: 'string',
        description: 'Pano adına göre filtrele (isteğe bağlı)',
      },
    },
  };

  async execute(args: any): Promise<ToolResult> {
    try {
      const boards = await trelloClient.getBoards();
      
      let filteredBoards = boards;

      // Filter by archived status
      if (!args.includeArchived) {
        filteredBoards = filteredBoards.filter(board => !board.closed);
      }

      // Filter by name
      if (args.filter) {
        const filterLower = args.filter.toLowerCase();
        filteredBoards = filteredBoards.filter(board => 
          board.name.toLowerCase().includes(filterLower)
        );
      }

      if (filteredBoards.length === 0) {
        return this.success('Hiç pano bulunamadı.');
      }

      const boardList = this.formatList(
        filteredBoards,
        (board: TrelloBoard) => 
          `• **${board.name}** (ID: ${board.id})\n` +
          `  URL: ${board.shortUrl}\n` +
          `  ${board.desc ? `Açıklama: ${this.truncateText(board.desc)}\n` : ''}` +
          `  ${board.closed ? '🗄️ Arşivlenmiş' : '✅ Aktif'}`,
        `📋 Panolar (${filteredBoards.length} adet)`
      );

      return this.success(boardList);

    } catch (error) {
      return this.error(`Panolar alınırken hata oluştu: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }
}

export class GetBoardTool extends BaseTool {
  readonly name = 'get_board';
  readonly description = 'Belirli bir panonun detaylı bilgilerini al';
  readonly inputSchema = {
    type: 'object',
    properties: {
      boardId: {
        type: 'string',
        description: 'Pano ID\'si',
      },
    },
    required: ['boardId'],
  };

  async execute(args: any): Promise<ToolResult> {
    try {
      this.validateRequired(args, ['boardId']);

      const board = await trelloClient.getBoard(args.boardId);

      const boardInfo = [
        `📋 **${board.name}**`,
        `ID: ${board.id}`,
        `URL: ${board.shortUrl}`,
        `Durum: ${board.closed ? '🗄️ Arşivlenmiş' : '✅ Aktif'}`,
        board.desc ? `Açıklama: ${board.desc}` : '',
        board.organization ? `Organizasyon: ${board.organization.name}` : '',
        `Son aktivite: ${this.formatDate(board.dateLastActivity)}`,
        board.dateLastView ? `Son görünteleme: ${this.formatDate(board.dateLastView)}` : '',
        '',
        '**Görsel Ayarlar:**',
        `Arkaplan: ${board.prefs.backgroundColor || 'Varsayılan'}`,
        board.prefs.backgroundImage ? `Arkaplan resmi: Var` : '',
        `İzin seviyesi: ${board.prefs.permissionLevel}`,
      ].filter(line => line !== '').join('\n');

      return this.success(boardInfo);

    } catch (error) {
      return this.error(`Pano bilgileri alınırken hata oluştu: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }
}

export class GetBoardListsTool extends BaseTool {
  readonly name = 'get_board_lists';
  readonly description = 'Belirli bir panodaki listeleri getir';
  readonly inputSchema = {
    type: 'object',
    properties: {
      boardId: {
        type: 'string',
        description: 'Pano ID\'si',
      },
      includeArchived: {
        type: 'boolean',
        description: 'Arşivlenmiş listeleri de dahil et (varsayılan: false)',
        default: false,
      },
    },
    required: ['boardId'],
  };

  async execute(args: any): Promise<ToolResult> {
    try {
      this.validateRequired(args, ['boardId']);

      const lists = await trelloClient.getBoardLists(args.boardId);
      
      let filteredLists = lists;

      // Filter by archived status
      if (!args.includeArchived) {
        filteredLists = filteredLists.filter(list => !list.closed);
      }

      if (filteredLists.length === 0) {
        return this.success('Bu panoda hiç liste bulunamadı.');
      }

      // Sort by position
      filteredLists.sort((a, b) => a.pos - b.pos);

      const listInfo = this.formatList(
        filteredLists,
        (list: TrelloList) => 
          `**${list.name}** (ID: ${list.id})\n` +
          `   Pozisyon: ${list.pos}\n` +
          `   ${list.closed ? '🗄️ Arşivlenmiş' : '✅ Aktif'}`,
        `📝 Listeler (${filteredLists.length} adet)`
      );

      return this.success(listInfo);

    } catch (error) {
      return this.error(`Liste bilgileri alınırken hata oluştu: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }
}

export class GetBoardStatsTool extends BaseTool {
  readonly name = 'get_board_stats';
  readonly description = 'Pano istatistiklerini getir (liste sayısı, kart sayısı vs.)';
  readonly inputSchema = {
    type: 'object',
    properties: {
      boardId: {
        type: 'string',
        description: 'Pano ID\'si',
      },
    },
    required: ['boardId'],
  };

  async execute(args: any): Promise<ToolResult> {
    try {
      this.validateRequired(args, ['boardId']);

      // Get board info and lists
      const [board, lists] = await Promise.all([
        trelloClient.getBoard(args.boardId),
        trelloClient.getBoardLists(args.boardId),
      ]);

      // Get cards count for each list
      const cardCounts = await Promise.all(
        lists.map(async (list) => {
          const cards = await trelloClient.getListCards(list.id);
          return {
            listName: list.name,
            cardCount: cards.length,
            archivedCards: cards.filter(card => card.closed).length,
          };
        })
      );

      const totalCards = cardCounts.reduce((sum, list) => sum + list.cardCount, 0);
      const totalArchivedCards = cardCounts.reduce((sum, list) => sum + list.archivedCards, 0);
      const activeLists = lists.filter(list => !list.closed).length;
      const archivedLists = lists.filter(list => list.closed).length;

      const stats = this.createSummary('📊 Pano İstatistikleri', {
        'Pano Adı': board.name,
        'Toplam Liste': lists.length,
        'Aktif Listeler': activeLists,
        'Arşivlenmiş Listeler': archivedLists,
        'Toplam Kart': totalCards,
        'Arşivlenmiş Kartlar': totalArchivedCards,
        'Aktif Kartlar': totalCards - totalArchivedCards,
      });

      const listDetails = cardCounts.map(list => 
        `• ${list.listName}: ${list.cardCount} kart (${list.archivedCards} arşivlenmiş)`
      ).join('\n');

      return this.success(`${stats}\n\n📋 Liste Detayları:\n${listDetails}`);

    } catch (error) {
      return this.error(`Pano istatistikleri alınırken hata oluştu: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }
}

// Export all board tools
export const boardTools = [
  new GetBoardsTool(),
  new GetBoardTool(),
  new GetBoardListsTool(),
  new GetBoardStatsTool(),
];
