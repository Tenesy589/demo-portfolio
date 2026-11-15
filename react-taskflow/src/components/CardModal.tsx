import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useDeleteCard, useUpdateCard, useUsers } from '@/hooks/queries';
import type { Card, Priority } from '@/types';
import { PRIORITY_LABEL } from './CardItem';

interface Props { card: Card; onClose: () => void; onEditing: (editing: boolean) => void }

export function CardModal({ card, onClose, onEditing }: Props) {
  const [form, setForm] = useState({ title: card.title, description: card.description, priority: card.priority, assigneeId: card.assigneeId });
  const update = useUpdateCard(card.boardId);
  const remove = useDeleteCard(card.boardId);
  const { data: users = [] } = useUsers();
  // Two-step delete instead of a native confirm(): no blocking dialog, no accidental data loss.
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Broadcast "I'm editing this card" for as long as the modal is open.
  useEffect(() => {
    onEditing(true);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => (onEditing(false), window.removeEventListener('keydown', onKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id]);

  const save = () => {
    update.mutate({ id: card.id, version: card.version, ...form });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <input className="input mb-4 text-lg font-semibold" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <textarea className="input min-h-32" placeholder="Описание задачи…" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-slate-500">
            Приоритет
            <select className="input mt-1" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
              {(['LOW', 'MEDIUM', 'HIGH'] as const).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500">
            Исполнитель
            <select className="input mt-1" value={form.assigneeId ?? ''} onChange={(e) => setForm({ ...form, assigneeId: e.target.value || null })}>
              <option value="">Не назначен</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-6 flex items-center gap-2">
          <button
            className={clsx('btn', confirmDelete ? 'bg-rose-600 text-white hover:bg-rose-700' : 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10')}
            onClick={() => (confirmDelete ? (remove.mutate(card.id), onClose()) : setConfirmDelete(true))}
            onBlur={() => setConfirmDelete(false)}
          >
            {confirmDelete ? 'Нажмите ещё раз для удаления' : 'Удалить'}
          </button>
          <span className="flex-1" />
          <button className="btn-ghost" onClick={onClose}>Отмена</button>
          <button className="btn-primary" onClick={save} disabled={!form.title.trim()}>Сохранить</button>
        </div>
      </div>
    </div>
  );
}
