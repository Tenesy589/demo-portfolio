import type { Board, BoardEvent, Card, Column } from '@/types';

const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;

/** Remove the card everywhere, then insert into its column ordered by position. Idempotent. */
export function upsertCard(board: Board, card: Card): Board {
  return {
    ...board,
    columns: board.columns.map((col) => {
      const cards = col.cards.filter((c) => c.id !== card.id);
      return col.id === card.columnId ? { ...col, cards: [...cards, card].sort(byPosition) } : { ...col, cards };
    }),
  };
}

export function removeCard(board: Board, id: string): Board {
  return { ...board, columns: board.columns.map((col) => ({ ...col, cards: col.cards.filter((c) => c.id !== id) })) };
}

/** Client-side mirror of the server's fractional indexing, for instant optimistic moves. */
export function positionAt(cards: Card[], index: number, movingId: string): number {
  const siblings = cards.filter((c) => c.id !== movingId);
  const before = siblings[index - 1]?.position;
  const after = siblings[index]?.position;
  if (before === undefined && after === undefined) return 1000;
  if (before === undefined) return after! / 2;
  if (after === undefined) return before + 1000;
  return (before + after) / 2;
}

/**
 * Pure reducer applying a server event to the cached board. Because every
 * branch is idempotent, our own echoed events are harmless.
 */
export function applyEvent(board: Board, event: BoardEvent): Board {
  switch (event.type) {
    case 'card.created':
    case 'card.updated':
    case 'card.moved':
      return upsertCard(board, event.payload);
    case 'card.deleted':
      return removeCard(board, event.payload.id);
    case 'column.created':
      if (board.columns.some((c) => c.id === event.payload.id)) return board;
      return { ...board, columns: [...board.columns, { ...event.payload, cards: [] }].sort(byPosition) };
    case 'column.updated':
      return { ...board, columns: board.columns.map((c: Column) => (c.id === event.payload.id ? { ...c, title: event.payload.title } : c)) };
    case 'column.deleted':
      return { ...board, columns: board.columns.filter((c) => c.id !== event.payload.id) };
    case 'board.updated':
      return { ...board, title: event.payload.title };
    case 'board.deleted':
      return board; // handled by the page: it navigates away
  }
}
