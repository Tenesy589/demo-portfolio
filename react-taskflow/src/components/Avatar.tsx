import clsx from 'clsx';

const COLORS = ['bg-rose-500', 'bg-amber-500', 'bg-emerald-500', 'bg-sky-500', 'bg-violet-500', 'bg-pink-500'];
const colorFor = (id: string) => COLORS[[...id].reduce((h, c) => h + c.charCodeAt(0), 0) % COLORS.length];

export function Avatar({ user, size = 'md' }: { user: { id: string; name: string }; size?: 'sm' | 'md' }) {
  const initials = user.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span
      title={user.name}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-white dark:ring-slate-900',
        colorFor(user.id),
        size === 'sm' ? 'size-6 text-[10px]' : 'size-8 text-xs',
      )}
    >
      {initials}
    </span>
  );
}
