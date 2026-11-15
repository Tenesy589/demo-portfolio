import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';

interface Props {
  value: string;
  onSave: (value: string) => void;
  className?: string;
  title?: string;
  maxLength?: number;
}

/** Click the text to edit it in place. Enter or clicking away saves, Escape cancels. */
export function InlineEdit({ value, onSave, className, title = 'Нажмите, чтобы переименовать', maxLength = 80 }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== value) onSave(next);
    else setDraft(value);
  };

  if (!editing) {
    return (
      <button type="button" title={title} onClick={() => setEditing(true)} className={clsx('cursor-text rounded-md px-1 -mx-1 text-left hover:bg-slate-500/10', className)}>
        {value}
      </button>
    );
  }
  return (
    <input
      ref={input}
      value={draft}
      maxLength={maxLength}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') (setDraft(value), setEditing(false));
      }}
      className={clsx('rounded-md border border-brand-500 bg-white px-1 -mx-1 outline-none dark:bg-slate-900', className)}
    />
  );
}
