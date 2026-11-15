import { useState, type ReactNode } from 'react';

/** A dismissible "how to use" box. Hidden state is remembered per panel in this browser. */
export function HelpPanel({ id, children }: { id: string; children: ReactNode }) {
  const key = `taskflow-help-${id}`;
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(key) === '1'; } catch { return false; }
  });
  const toggle = (value: boolean) => {
    setHidden(value);
    try { localStorage.setItem(key, value ? '1' : '0'); } catch { /* private mode */ }
  };

  if (hidden) {
    return (
      <button className="self-start text-sm text-brand-500 hover:underline" onClick={() => toggle(false)}>
        ? Как пользоваться
      </button>
    );
  }
  return (
    <div className="relative rounded-xl border border-sky-200 bg-sky-50 px-4 pt-8 pb-4 text-sm sm:pt-4 sm:pr-24 text-slate-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-slate-300">
      <button className="absolute top-3 right-3 text-xs text-slate-500 hover:text-slate-800" onClick={() => toggle(true)}>скрыть ✕</button>
      {children}
    </div>
  );
}
