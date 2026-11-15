import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useState, type FormEvent } from 'react';
import { useCreateCard, useDeleteColumn, useRenameColumn } from '@/hooks/queries';
import { ConfirmButton } from './ConfirmButton';
import { InlineEdit } from './InlineEdit';
import type { Card, Column, User } from '@/types';
import { CardItem } from './CardItem';

interface Props { column: Column; editing: Record<string, User[]>; onOpen: (card: Card) => void }

export function ColumnView({ column, editing, onOpen }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { type: 'column' } });
  const createCard = useCreateCard(column.boardId);
  const rename = useRenameColumn(column.boardId);
  const remove = useDeleteColumn(column.boardId);
  const [draft, setDraft] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (draft?.trim()) createCard.mutate({ columnId: column.id, title: draft.trim() });
    setDraft(null);
  };

  return (
    <section className="flex min-w-64 max-w-80 flex-1 basis-64 flex-col rounded-2xl bg-slate-200/60 dark:bg-slate-900">
      <header className="group/col flex items-center justify-between gap-1 px-3 pt-3 pb-2">
        <h3 className="min-w-0 truncate text-sm font-semibold">
          <InlineEdit value={column.title} maxLength={40} onSave={(title) => rename.mutate({ id: column.id, title })} title="Нажмите, чтобы переименовать колонку" />
        </h3>
        <span className="flex-1" />
        <ConfirmButton
          className="!px-1.5 !py-0.5 text-xs opacity-60 group-hover/col:opacity-100"
          title="Удалить колонку"
          confirmText={column.cards.length ? `Удалить вместе с ${column.cards.length} карт.?` : 'Удалить?'}
          onConfirm={() => remove.mutate(column.id)}
        >
          ✕
        </ConfirmButton>
        <span className="rounded-full bg-slate-300/70 px-2 text-xs dark:bg-slate-800" title="Карточек в колонке">{column.cards.length}</span>
      </header>
      <SortableContext id={column.id} items={column.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={`flex min-h-24 flex-1 flex-col gap-2 rounded-xl p-2 transition ${isOver ? 'bg-brand-500/10' : ''}`}>
          {column.cards.length === 0 && <p className="py-6 text-center text-xs text-slate-400">Перетащите карточку сюда</p>}
          {column.cards.map((card) => (
            <CardItem key={card.id} card={card} editors={editing[card.id]} onOpen={onOpen} />
          ))}
        </div>
      </SortableContext>
      <div className="p-2 pt-0">
        {draft === null ? (
          <button className="btn-ghost w-full justify-start" onClick={() => setDraft('')}>+ Добавить карточку</button>
        ) : (
          <form onSubmit={submit}>
            <input autoFocus className="input" placeholder="Название задачи и Enter…" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={submit} onKeyDown={(e) => e.key === 'Escape' && setDraft(null)} />
          </form>
        )}
      </div>
    </section>
  );
}
