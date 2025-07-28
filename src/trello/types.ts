// Trello API Types
export interface TrelloBoard {
  id: string;
  name: string;
  desc: string;
  closed: boolean;
  url: string;
  shortUrl: string;
  prefs: {
    permissionLevel: string;
    background: string;
    backgroundColor: string;
    backgroundImage?: string;
  };
  organization?: {
    id: string;
    name: string;
  };
  dateLastActivity: string;
  dateLastView?: string;
}

export interface TrelloList {
  id: string;
  name: string;
  closed: boolean;
  pos: number;
  subscribed: boolean;
  idBoard: string;
  limits?: any;
}

export interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  closed: boolean;
  pos: number;
  url: string;
  shortUrl: string;
  idBoard: string;
  idList: string;
  idMembers: string[];
  idLabels: string[];
  due?: string;
  dueComplete?: boolean;
  dateLastActivity: string;
  badges: {
    votes: number;
    attachments: number;
    comments: number;
    checkItems: number;
    checkItemsChecked: number;
    description: boolean;
    due?: string;
    dueComplete?: boolean;
  };
  labels: TrelloLabel[];
  members: TrelloMember[];
  checklists?: TrelloChecklist[];
}

export interface TrelloLabel {
  id: string;
  idBoard: string;
  name: string;
  color: string;
  uses: number;
}

export interface TrelloMember {
  id: string;
  username: string;
  fullName: string;
  avatarHash?: string;
  avatarUrl?: string;
  initials: string;
}

export interface TrelloChecklist {
  id: string;
  name: string;
  idBoard: string;
  idCard: string;
  pos: number;
  checkItems: TrelloCheckItem[];
}

export interface TrelloCheckItem {
  id: string;
  name: string;
  nameData?: any;
  pos: number;
  state: 'incomplete' | 'complete';
  due?: string;
  dueReminder?: number;
  idMember?: string;
}

export interface TrelloOrganization {
  id: string;
  name: string;
  displayName: string;
  desc: string;
  url: string;
  website?: string;
}

// API Request/Response Types
export interface TrelloApiError {
  message: string;
  error: string;
  status: number;
}

export interface CreateCardRequest {
  name: string;
  desc?: string;
  pos?: string | number;
  due?: string;
  dueComplete?: boolean;
  idList: string;
  idMembers?: string[];
  idLabels?: string[];
  urlSource?: string;
  fileSource?: string;
  idCardSource?: string;
  keepFromSource?: string;
}

export interface UpdateCardRequest {
  name?: string;
  desc?: string;
  closed?: boolean;
  idMembers?: string[];
  idAttachmentCover?: string;
  idList?: string;
  idLabels?: string[];
  idBoard?: string;
  pos?: string | number;
  due?: string;
  dueComplete?: boolean;
  subscribed?: boolean;
}

export interface CreateListRequest {
  name: string;
  idBoard: string;
  idListSource?: string;
  pos?: string | number;
}

export interface UpdateListRequest {
  name?: string;
  closed?: boolean;
  idBoard?: string;
  pos?: string | number;
  subscribed?: boolean;
}

export interface SearchRequest {
  query: string;
  idBoards?: string;
  idOrganizations?: string;
  idCards?: string;
  modelTypes?: string;
  board_fields?: string;
  boards_limit?: number;
  card_fields?: string;
  cards_limit?: number;
  cards_page?: number;
  card_board?: boolean;
  card_list?: boolean;
  card_members?: boolean;
  card_stickers?: boolean;
  card_attachments?: boolean;
  organization_fields?: string;
  organizations_limit?: number;
  member_fields?: string;
  members_limit?: number;
  partial?: boolean;
}

export interface SearchResponse {
  cards: TrelloCard[];
  boards: TrelloBoard[];
  organizations: TrelloOrganization[];
  members: TrelloMember[];
}

// API Configuration
export interface TrelloApiConfig {
  apiKey: string;
  token: string;
  baseUrl?: string;
}

// Utility Types
export type TrelloEntityType = 'board' | 'list' | 'card' | 'member' | 'organization';

export interface TrelloWebhook {
  id: string;
  description: string;
  idModel: string;
  callbackURL: string;
  active: boolean;
  consecutiveFailures: number;
  firstConsecutiveFailDate?: string;
}

export interface BulkCreateCardsRequest {
  cards: Omit<CreateCardRequest, 'idList'>[];
  idList: string;
}

export interface BulkUpdateCardsRequest {
  updates: Array<{
    id: string;
    data: UpdateCardRequest;
  }>;
}

// Export utility functions for type checking
export const isTrelloBoard = (obj: any): obj is TrelloBoard => {
  return obj && typeof obj.id === 'string' && typeof obj.name === 'string';
};

export const isTrelloCard = (obj: any): obj is TrelloCard => {
  return obj && typeof obj.id === 'string' && typeof obj.name === 'string' && typeof obj.idList === 'string';
};

export const isTrelloList = (obj: any): obj is TrelloList => {
  return obj && typeof obj.id === 'string' && typeof obj.name === 'string' && typeof obj.idBoard === 'string';
};
