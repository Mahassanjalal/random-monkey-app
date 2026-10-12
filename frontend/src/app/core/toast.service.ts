import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  readonly toasts = signal<Toast[]>([]);

  push(kind: Toast['kind'], message: string, durationMs = 3500) {
    const t: Toast = { id: this.nextId++, kind, message };
    this.toasts.update((list) => [...list, t]);
    setTimeout(() => this.dismiss(t.id), durationMs);
  }

  success(message: string) { this.push('success', message); }
  error(message: string) { this.push('error', message, 5000); }
  info(message: string) { this.push('info', message); }

  dismiss(id: number) {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
