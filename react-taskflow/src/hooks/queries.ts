import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '@/lib/api';
import { positionAt, removeCard, upsertCard } from '@/lib/board-cache';
import { toast } from '@/store/ui';
import type { Activity, Board, BoardSummary, Card, Priority, User } from '@/types';

export const keys = {
  boards: ['boards'] as const,
  board: (id: string) => ['board', id] as const,
  activity: (id: string) => ['board', id, 'activity'] as const,
  users: ['users'] as const,
};

export const useBoards = () => useQuery({ queryKey: keys.boards, queryFn: () => api<BoardSummary[]>('/boards') });
export const useBoard = (id: string) => useQuery({ queryKey: keys.board(id), queryFn: () => api<Board>(`/boards/${id}`) });
export const useActivity = (id: string) => useQuery({ queryKey: keys.activity(id), queryFn: () => api<Activity[]>(`/boards/${id}/activity?take=20`) });
export const useUsers = () => useQuery({ queryKey: keys.users, queryFn: () => api<User[]>('/auth/users'), staleTime: 5 * 60_000 });

export function useCreateBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => api<Board>('/boards', { method: 'POST', json: { title } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.boards }),
  });
}

/** Shared optimistic-update plumbing: snapshot → patch cache → rollback on error. */
function useOptimisticBoard<TVars, TResult>(
  boardId: string,
  mutationFn: (vars: TVars) => Promise<TResult>,
  patch: (board: Board, vars: TVars) => Board,
  onServer?: (board: Board, result: TResult) => Board,
) {
  const qc = useQueryClient();
  const key = keys.board(boardId);
  return useMutation({
    mutationFn,
    onMutate: async (vars: TVars) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Board>(key);
      if (previous) qc.setQueryData(key, patch(previous, vars));
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      toast(err instanceof ApiError && err.status === 409 ? 'Эту карточку только что изменил другой пользователь — показана актуальная версия' : err.message, 'error');
      if (err instanceof ApiError && err.status === 409) qc.invalidateQueries({ queryKey: key });
    },
    onSuccess: (result) => {
      if (onServer) qc.setQueryData<Board>(key, (b) => (b ? onServer(b, result) : b));
    },
  });
}

export function useMoveCard(boardId: string) {
  return useOptimisticBoard(
    boardId,
    (v: { card: Card; columnId: string; index: number }) => api<Card>(`/cards/${v.card.id}/move`, { method: 'POST', json: { columnId: v.columnId, index: v.index } }),
    (board, { card, columnId, index }) => {
      const target = board.columns.find((c) => c.id === columnId)!;
      return upsertCard(board, { ...card, columnId, position: positionAt(target.cards, index, card.id) });
    },
    upsertCard,
  );
}

export function useUpdateCard(boardId: string) {
  return useOptimisticBoard(
    boardId,
    ({ id, ...body }: { id: string; version: number; title?: string; description?: string; priority?: Priority; assigneeId?: string | null }) =>
      api<Card>(`/cards/${id}`, { method: 'PATCH', json: body }),
    (board, v) => {
      const card = board.columns.flatMap((c) => c.cards).find((c) => c.id === v.id);
      return card ? upsertCard(board, { ...card, ...v }) : board;
    },
    upsertCard,
  );
}

export function useCreateCard(boardId: string) {
  return useOptimisticBoard(
    boardId,
    (v: { columnId: string; title: string }) => api<Card>(`/boards/${boardId}/cards`, { method: 'POST', json: v }),
    (board) => board, // wait for the server id; realtime echo will insert it too
    upsertCard,
  );
}

export function useDeleteCard(boardId: string) {
  return useOptimisticBoard(boardId, (id: string) => api<void>(`/cards/${id}`, { method: 'DELETE' }), removeCard);
}

export function useAddColumn(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => api(`/boards/${boardId}/columns`, { method: 'POST', json: { title } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.board(boardId) }),
  });
}
