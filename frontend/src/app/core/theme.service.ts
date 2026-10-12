import { Injectable, effect, signal } from '@angular/core';

export type ThemeMode = 'dark' | 'light' | 'auto';

/**
 * Appearance preferences. The active palette is applied by setting
 * `data-theme` on <html>; styles.scss defines dark tokens on :root and
 * light overrides under html[data-theme='light'].
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>(this.readStored());
  private readonly lightQuery = matchMedia('(prefers-color-scheme: light)');

  constructor() {
    effect(() => this.apply(this.mode()));
    this.lightQuery.addEventListener('change', () => this.apply(this.mode()));
  }

  get isLight(): boolean {
    return this.resolve() === 'light';
  }

  setMode(mode: ThemeMode) {
    this.mode.set(mode);
    try {
      localStorage.setItem('buddy:theme', mode);
    } catch {
      /* private mode */
    }
  }

  toggle() {
    this.setMode(this.resolve() === 'light' ? 'dark' : 'light');
  }

  private resolve(): 'light' | 'dark' {
    const m = this.mode();
    if (m === 'auto') return this.lightQuery.matches ? 'light' : 'dark';
    return m;
  }

  private apply(_mode: ThemeMode) {
    const light = this.resolve() === 'light';
    const root = document.documentElement;
    root.setAttribute('data-theme', light ? 'light' : 'dark');
    root.style.colorScheme = light ? 'light' : 'dark';
  }

  private readStored(): ThemeMode {
    try {
      const v = localStorage.getItem('buddy:theme');
      return v === 'light' || v === 'dark' || v === 'auto' ? v : 'dark';
    } catch {
      return 'dark';
    }
  }
}
