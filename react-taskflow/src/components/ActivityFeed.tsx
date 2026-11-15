import { useActivity } from '@/hooks/queries';
import { Avatar } from './Avatar';

const VERB: Record<string, string> = {
  'card.created': 'created', 'card.updated': 'updated', 'card.moved': 'moved', 'card.deleted': 'deleted',
  'column.created': 'added column', 'column.updated': 'renamed column', 'column.deleted': 'removed column',
};

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
function ago(iso: string) {
  const s = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  if (s > -60) return rtf.format(s, 'second');
  if (s > -3600) return rtf.format(Math.round(s / 60), 'minute');
  return rtf.format(Math.round(s / 3600), 'hour');
}

export function ActivityFeed({ boardId }: { boardId: string }) {
  const { data = [] } = useActivity(boardId);
  return (
    <aside className="hidden w-72 shrink-0 xl:block">
      <h3 className="mb-3 text-sm font-semibold text-slate-500">Activity</h3>
      <ol className="space-y-3">
        {data.length === 0 && <li className="text-sm text-slate-400">No activity yet — move a card!</li>}
        {data.map((a) => (
          <li key={a.id} className="flex gap-2 text-sm">
            <Avatar user={a.user} size="sm" />
            <p className="leading-snug">
              <b>{a.user.name.split(' ')[0]}</b> {VERB[a.type] ?? a.type} <span className="text-slate-500">“{a.payload.title}”</span>
              <span className="block text-xs text-slate-400">{ago(a.createdAt)}</span>
            </p>
          </li>
        ))}
      </ol>
    </aside>
  );
}
