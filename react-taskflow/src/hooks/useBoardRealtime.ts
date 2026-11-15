import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { applyEvent } from '@/lib/board-cache';
import { getSocket } from '@/lib/socket';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';
import type { Board, BoardEvent, User } from '@/types';
import { keys } from './queries';

export interface RealtimeState {
  connected: boolean;
  instance: string | null;
  presence: User[];
  /** cardId → users currently editing it */
  editing: Record<string, User[]>;
  setEditing: (cardId: string, editing: boolean) => void;
}

/**
 * Subscribes to a board room and keeps the React Query cache in sync with
 * server events — so every component reading the board re-renders, with
 * no extra global store for server state.
 */
export function useBoardRealtime(boardId: string): RealtimeState {
  const qc = useQueryClient();
  const { token, user: me } = useAuth();
  const [connected, setConnected] = useState(false);
  const [instance, setInstance] = useState<string | null>(null);
  const [presence, setPresence] = useState<User[]>([]);
  const [editing, setEditingMap] = useState<Record<string, User[]>>({});
  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);

  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    socketRef.current = socket;

    const join = () => {
      setConnected(true);
      socket.emit('board:join', boardId);
      qc.invalidateQueries({ queryKey: keys.board(boardId) }); // catch up on anything missed while offline
    };
    const onEvent = (e: BoardEvent) => {
      if (e.boardId !== boardId) return;
      qc.setQueryData<Board>(keys.board(boardId), (b) => (b ? applyEvent(b, e) : b));
      qc.invalidateQueries({ queryKey: keys.activity(boardId) });
      if (e.actor.id !== me?.id && e.type === 'card.created') toast(`${e.actor.name} добавил(а) «${e.payload.title}»`);
    };
    const onEditing = ({ cardId, editing, user }: { cardId: string; editing: boolean; user: User }) =>
      setEditingMap((prev) => {
        const next: Record<string, User[]> = {};
        for (const [id, users] of Object.entries(prev)) next[id] = users.filter((u) => u.id !== user.id || (id !== cardId && cardId !== '*'));
        if (editing) next[cardId] = [...(next[cardId] ?? []), user];
        return next;
      });

    socket.on('connect', join);
    socket.on('disconnect', () => setConnected(false));
    socket.on('hello', (h: { instance: string }) => setInstance(h.instance));
    socket.on('presence', setPresence);
    socket.on('board:event', onEvent);
    socket.on('card:editing', onEditing);
    if (socket.connected) join();

    return () => {
      socket.emit('board:leave');
      socket.off('connect', join).off('disconnect').off('hello').off('presence', setPresence).off('board:event', onEvent).off('card:editing', onEditing);
    };
  }, [boardId, token, qc, me?.id]);

  return {
    connected,
    instance,
    presence,
    editing,
    setEditing: (cardId, isEditing) => socketRef.current?.emit('card:editing', { cardId, editing: isEditing }),
  };
}
