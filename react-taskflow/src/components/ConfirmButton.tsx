import clsx from 'clsx';
import { useEffect, useState, type ReactNode } from 'react';

interface Props {
  onConfirm: () => void;
  children: ReactNode;
  confirmText: string;
  className?: string;
  title?: string;
}

/**
 * Destructive action in two clicks, without a blocking browser dialog:
 * the first click arms it (red), the second performs it. Disarms after 4 s or on blur.
 */
export function ConfirmButton({ onConfirm, children, confirmText, className, title }: Props) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <button
      type="button"
      title={title}
      onBlur={() => setArmed(false)}
      onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}
      className={clsx('btn', armed ? 'bg-rose-600 text-white hover:bg-rose-700' : 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10', className)}
    >
      {armed ? confirmText : children}
    </button>
  );
}
