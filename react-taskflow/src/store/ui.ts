import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark';

export const useTheme = create<{ theme: Theme; toggle: () => void }>()(
  persist(
    (set, get) => ({
      theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      toggle: () => {
        const theme = get().theme === 'dark' ? 'light' : 'dark';
        document.documentElement.classList.toggle('dark', theme === 'dark');
        set({ theme });
      },
    }),
    { name: 'taskflow-theme' },
  ),
);

interface Toast { id: number; message: string; tone: 'info' | 'error' }

export const useToasts = create<{ toasts: Toast[]; push: (message: string, tone?: Toast['tone']) => void; dismiss: (id: number) => void }>(
  (set, get) => ({
    toasts: [],
    push: (message, tone = 'info') => {
      const id = Date.now() + Math.random();
      set({ toasts: [...get().toasts, { id, message, tone }].slice(-4) });
      setTimeout(() => get().dismiss(id), 4000);
    },
    dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  }),
);

export const toast = (message: string, tone?: Toast['tone']) => useToasts.getState().push(message, tone);
