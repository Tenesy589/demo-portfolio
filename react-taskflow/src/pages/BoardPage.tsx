import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ActivityFeed } from '@/components/ActivityFeed';
import { Avatar } from '@/components/Avatar';
import { CardModal } from '@/components/CardModal';
import { CardView } from '@/components/CardItem';
import { ColumnView } from '@/components/ColumnView';
import { HelpPanel } from '@/components/HelpPanel';
import { keys, useAddColumn, useBoard, useMoveCard } from '@/hooks/queries';
import { useBoardRealtime } from '@/hooks/useBoardRealtime';
import { positionAt, upsertCard } from '@/lib/board-cache';
import { useAuth } from '@/store/auth';
import type { Board, Card, Column } from '@/types';

/** The column that holds this card id, or the column whose own id it is. */
const findColumn = (cols: Column[], id: string) => cols.find((c) => c.id === id || c.cards.some((k) => k.id === id));

export default function BoardPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const { data: board, isLoading, error } = useBoard(id);
  const rt = useBoardRealtime(id);
  const move = useMoveCard(id);
  const addColumn = useAddColumn(id);
  const token = useAuth((s) => s.token);
  const [active, setActive] = useState<Card | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  // While dragging, the board is rendered from this local copy so the target
  // column opens a gap under the pointer (multi-container sortable).
  const [dragCols, setDragCols] = useState<Column[] | null>(null);
  const justDragged = useRef(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), // a click opens the card, a drag moves it
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }), // on phones: press and hold, then drag
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }), // accessible: Space, arrows, Space
  );
  const onOpen = useCallback((card: Card) => {
    if (!justDragged.current) setOpenId(card.id);
  }, []);

  if (isLoading) return <div className="p-6 text-slate-500">Загрузка доски…</div>;
  if (error || !board) return <div className="p-6 text-rose-600">Доска не найдена. <Link className="underline" to="/">Назад</Link></div>;

  const columns = dragCols ?? board.columns;
  const allCards = board.columns.flatMap((c) => c.cards);
  const openCard = allCards.find((c) => c.id === openId);

  const onDragStart = ({ active }: DragStartEvent) => {
    setActive(active.data.current?.card ?? null);
    setDragCols(board.columns);
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    setDragCols((cols) => {
      if (!cols) return cols;
      const from = findColumn(cols, String(active.id));
      const to = findColumn(cols, String(over.id));
      if (!from || !to || from.id === to.id) return cols;
      const card = from.cards.find((c) => c.id === active.id)!;
      const overIndex = to.cards.findIndex((c) => c.id === over.id);
      const at = overIndex >= 0 ? overIndex : to.cards.length;
      return cols.map((c) => {
        if (c.id === from.id) return { ...c, cards: c.cards.filter((k) => k.id !== card.id) };
        if (c.id === to.id) return { ...c, cards: [...c.cards.slice(0, at), { ...card, columnId: to.id }, ...c.cards.slice(at)] };
        return c;
      });
    });
  };

  const endDrag = () => {
    setActive(null);
    setDragCols(null);
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 0);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const cols = dragCols;
    endDrag();
    if (!over || !cols) return;
    const original = allCards.find((c) => c.id === active.id);
    const column = findColumn(cols, String(active.id));
    if (!original || !column) return;

    const from = column.cards.findIndex((c) => c.id === active.id);
    const overIndex = column.cards.findIndex((c) => c.id === over.id);
    const index = overIndex >= 0 ? overIndex : from;

    const originalIndex = board.columns.find((c) => c.id === original.columnId)!.cards.findIndex((c) => c.id === original.id);
    if (original.columnId === column.id && originalIndex === index) return;

    // Apply the move to the cache synchronously, so the card never flickers back for a frame.
    const target = board.columns.find((c) => c.id === column.id)!;
    qc.setQueryData<Board>(keys.board(id), (b) => (b ? upsertCard(b, { ...original, columnId: column.id, position: positionAt(target.cards, index, original.id) }) : b));
    move.mutate({ card: original, columnId: column.id, index });
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
        <Link to="/" className="btn-ghost" title="Ко всем доскам">←</Link>
        <h1 className="text-xl font-bold">{board.title}</h1>
        <span
          title={rt.connected ? 'Изменения других участников появляются мгновенно' : 'Связь потеряна, переподключаемся'}
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${rt.connected ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-500/10 text-slate-500'}`}
        >
          <span className={`size-2 rounded-full ${rt.connected ? 'animate-pulse bg-emerald-500' : 'bg-slate-400'}`} />
          {rt.connected ? 'Онлайн' : 'Переподключение…'}
        </span>
        <div className="flex-1" />
        {rt.presence.length > 0 && (
          <div className="flex items-center gap-2" title="Кто сейчас смотрит эту доску">
            <span className="text-xs text-slate-500">Сейчас на доске:</span>
            <div className="flex -space-x-2">{rt.presence.map((u) => <Avatar key={u.id} user={u} />)}</div>
          </div>
        )}
        <button className="btn-ghost" onClick={exportCsv} title="Скачать все карточки таблицей (открывается в Excel)">⬇ Excel / CSV</button>
        <button className="btn-ghost" onClick={() => { const t = prompt('Название новой колонки'); if (t?.trim()) addColumn.mutate(t.trim()); }}>+ Колонка</button>
      </div>

      <HelpPanel id="board">
        <p><b>Как пользоваться доской</b></p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li><b>Перетаскивайте карточки</b> мышкой между колонками, чтобы менять статус задачи. На телефоне — нажмите и удерживайте карточку, затем перетащите.</li>
          <li><b>Нажмите на карточку</b>, чтобы изменить название, описание, приоритет или исполнителя.</li>
          <li><b>«+ Добавить карточку»</b> внизу колонки создаёт новую задачу.</li>
          <li><b>Совместная работа:</b> откройте эту доску во второй вкладке или на телефоне под другим пользователем (alice@liveboard.dev / demo1234) — все изменения появятся у обоих мгновенно, без перезагрузки.</li>
          <li className="hidden xl:list-item">Справа — <b>история действий</b> команды: кто что изменил.</li>
        </ul>
      </HelpPanel>

      <div className="flex min-w-0 gap-6">
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={endDrag}>
          <div className="flex min-w-0 flex-1 gap-4 overflow-x-auto pb-4">
            {columns.map((col) => <ColumnView key={col.id} column={col} editing={rt.editing} onOpen={onOpen} />)}
          </div>
          <DragOverlay>{active && <CardView card={active} overlay />}</DragOverlay>
        </DndContext>
        <ActivityFeed boardId={id} />
      </div>

      {openCard && <CardModal key={openCard.id} card={openCard} onClose={() => setOpenId(null)} onEditing={(e) => rt.setEditing(openCard.id, e)} />}
    </div>
  );
}
