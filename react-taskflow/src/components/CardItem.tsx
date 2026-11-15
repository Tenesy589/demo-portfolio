import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import { memo } from 'react';
import type { Card, User } from '@/types';
import { Avatar } from './Avatar';

const PRIORITY = {
  HIGH: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  LOW: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
};

interface Props { card: Card; editors?: User[]; onOpen?: (card: Card) => void; overlay?: boolean }

export function CardView({ card, editors, onOpen, overlay }: Props) {
  return (
    <div
      onClick={() => onOpen?.(card)}
      className={clsx(
        'group cursor-grab rounded-xl border bg-white p-3 shadow-sm transition hover:shadow-md active:cursor-grabbing dark:bg-slate-800',
        editors?.length ? 'border-brand-500 ring-2 ring-brand-500/30' : 'border-slate-200 dark:border-slate-700',
        overlay && 'rotate-2 shadow-xl',
      )}
    >
      <p className="text-sm leading-snug font-medium">{card.title}</p>
      <div className="mt-3 flex items-center gap-2">
        <span className={clsx('rounded-md px-1.5 py-0.5 text-[11px] font-semibold', PRIORITY[card.priority])}>{card.priority}</span>
        {editors?.length ? <span className="animate-pulse text-[11px] text-brand-500">✏️ {editors[0].name.split(' ')[0]} editing…</span> : null}
        <span className="flex-1" />
        {card.assignee && <Avatar user={card.assignee} size="sm" />}
      </div>
    </div>
  );
}

/** memo: during a drag only the moving card and its column re-render. */
export const CardItem = memo(function CardItem(props: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.card.id, data: { type: 'card', card: props.card } });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={clsx(isDragging && 'opacity-30')} {...attributes} {...listeners}>
      <CardView {...props} />
    </div>
  );
});
