import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar } from '@/components/Avatar';
import { useBoards, useCreateBoard } from '@/hooks/queries';

export default function BoardsPage() {
  const { data: boards, isLoading } = useBoards();
  const create = useCreateBoard();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (title.trim()) create.mutate(title.trim(), { onSuccess: (b) => navigate(`/boards/${b.id}`) });
  };

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Your boards</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && Array.from({ length: 3 }, (_, i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />)}
        {boards?.map((b) => (
          <Link key={b.id} to={`/boards/${b.id}`} className="group flex h-32 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-semibold group-hover:text-brand-500">{b.title}</h2>
            <div className="mt-auto flex items-center gap-2 text-sm text-slate-500">
              <Avatar user={b.owner} size="sm" /> {b.owner.name} · {b._count.cards} cards
            </div>
          </Link>
        ))}
        <form onSubmit={submit} className="flex h-32 flex-col justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 p-5 dark:border-slate-700">
          <input className="input" placeholder="New board title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <button className="btn-primary" disabled={create.isPending}>Create board</button>
        </form>
      </div>
    </div>
  );
}
