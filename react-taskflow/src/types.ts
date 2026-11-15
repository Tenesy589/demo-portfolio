export type Priority = 'LOW' | 'MEDIUM' | 'HIGH';

export interface User { id: string; name: string; email?: string }

export interface Card {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  description: string;
  priority: Priority;
  position: number;
  version: number;
  assignee: User | null;
  assigneeId: string | null;
  updatedAt: string;
}

export interface Column { id: string; boardId: string; title: string; position: number; cards: Card[] }

export interface Board { id: string; title: string; columns: Column[] }

export interface BoardSummary {
  id: string;
  title: string;
  createdAt: string;
  owner: User;
  _count: { cards: number };
}

export interface Activity {
  id: string;
  type: string;
  createdAt: string;
  user: User;
  payload: { id?: string; title?: string };
}

export type BoardEvent =
  | { type: 'card.created' | 'card.updated' | 'card.moved'; boardId: string; actor: User; payload: Card; at: string }
  | { type: 'card.deleted'; boardId: string; actor: User; payload: { id: string; title: string }; at: string }
  | { type: 'column.created' | 'column.updated'; boardId: string; actor: User; payload: Column; at: string }
  | { type: 'column.deleted'; boardId: string; actor: User; payload: { id: string }; at: string }
  | { type: 'board.updated'; boardId: string; actor: User; payload: { id: string; title: string }; at: string }
  | { type: 'board.deleted'; boardId: string; actor: User; payload: { id: string }; at: string };
