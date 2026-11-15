import { Link, Outlet } from 'react-router-dom';
import { closeSocket } from '@/lib/socket';
import { useAuth } from '@/store/auth';
import { useTheme, useToasts } from '@/store/ui';
import { Avatar } from './Avatar';

export function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <span className="grid size-8 place-items-center rounded-lg bg-brand-500 text-white">✓</span> TaskFlow
          </Link>
          <div className="flex-1" />
          <button className="btn-ghost" onClick={toggle} aria-label="Toggle theme">{theme === 'dark' ? '☀️' : '🌙'}</button>
          {user && (
            <>
              <Avatar user={user} />
              <button className="btn-ghost" onClick={() => (closeSocket(), logout())}>Log out</button>
            </>
          )}
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <Toasts />
    </div>
  );
}

function Toasts() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`rounded-lg px-4 py-3 text-left text-sm shadow-lg ${t.tone === 'error' ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'}`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
