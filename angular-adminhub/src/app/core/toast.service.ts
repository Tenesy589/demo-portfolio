import { Injectable, signal } from '@angular/core';

export interface Toast { id: number; text: string; kind: 'success' | 'error' | 'info' }

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);

  show(text: string, kind: Toast['kind'] = 'info') {
    const id = Date.now() + Math.random();
    this.toasts.update((t) => [...t, { id, text, kind }].slice(-4));
    setTimeout(() => this.dismiss(id), 4000);
  }
  success = (text: string) => this.show(text, 'success');
  error = (text: string) => this.show(text, 'error');
  dismiss(id: number) {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }
}
