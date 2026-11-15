import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ActivityFeed } from '@/components/ActivityFeed';
import { Avatar } from '@/components/Avatar';
import { CardModal } from '@/components/CardModal';
import { CardView } from '@/components/CardItem';
import { ColumnView } from '@/components/ColumnView';
import { useAddColumn, useBoard, useMoveCard } from '@/hooks/queries';
import { useBoardRealtime } from '@/hooks/useBoardRealtime';
import { useAuth } from '@/store/auth';
import type { Card } from '@/types';

export default function BoardPage() {
  const { id = '' } = useParams();
  const { data: board, isLoading, error } = useBoard(id);
  const rt = useBoardRealtime(id);
  const move = useMoveCard(id);
  const addColumn = useAddColumn(id);
  const token = useAuth((s) => s.token);
  const [active, setActive] = useState<Card | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), // click opens, drag moves
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }), // accessible DnD
  );
  const onOpen = useCallback((card: Card) => setOpenId(card.id), []);

  if (isLoading) return <div className="p-6 text-slate-500">Loading board…</div>;
  if (error || !board) return <div className="p-6 text-rose-600">Board not found. <Link className="underline" to="/">Back</Link></div>;

  const allCards = board.columns.flatMap((c) => c.cards);
  const openCard = allCards.find((c) => c.id === openId);

  const onDragStart = ({ active }: DragStartEvent) => setActive(active.data.current?.card ?? null);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActive(null);
    if (!over) return;
    const card = allCards.find((c) => c.id === active.id);
    if (!card) return;
    const overCard = allCards.find((c) => c.id === over.id);
    const columnId = overCard ? overCard.columnId : String(over.id);
    const column = board.columns.find((c) => c.id === columnId);
    if (!column) return;
    const index = overCard ? column.cards.findIndex((c) => c.id === overCard.id) : column.cards.length;
    const currentIndex = column.cards.findIndex((c) => c.id === card.id);
    if (card.columnId === columnId && currentIndex === index) return;
    move.mutate({ card, columnId, index });
  };

  const exportCsv = async () => {
    const res = await fetch(`/api/boards/${id}/export.csv`, { headers: { Authorization: `Bearer ${token}` } });
    const url = URL.createObjectURL(await res.blob());
    Object.assign(document.createElement('a'), { href: url, download: `${board.title}.csv` }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/" className="btn-ghost">←</Link>
        <h1 className="text-xl font-bold">{board.title}</h1>
        <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${rt.connected ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-500/10 text-slate-500'}`}>
          <span className={`size-2 rounded-full ${rt.connected ? 'animate-pulse bg-emerald-500' : 'bg-slate-400'}`} />
          {rt.connected ? `Live · node ${rt.instance?.slice(0, 6)}` : 'Offline'}
        </span>
        <div className="flex-1" />
        <div className="flex -space-x-2">{rt.presence.map((u) => <Avatar key={u.id} user={u} />)}</div>
        <button className="btn-ghost" onClick={exportCsv}>⬇ CSV</button>
        <button className="btn-ghost" onClick={() => { const t = prompt('Column title'); if (t) addColumn.mutate(t); }}>+ Column</button>
      </div>

      <div className="flex gap-6">
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
          <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
            {board.columns.map((col) => <ColumnView key={col.id} column={col} editing={rt.editing} onOpen={onOpen} />)}
          </div>
          <DragOverlay>{active && <CardView card={active} overlay />}</DragOverlay>
        </DndContext>
        <ActivityFeed boardId={id} />
      </div>

      {openCard && <CardModal key={openCard.id} card={openCard} onClose={() => setOpenId(null)} onEditing={(e) => rt.setEditing(openCard.id, e)} />}
    </div>
  );
}
