import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import type { AuthResponse, SessionUserDto } from '@bundle/shared';

const ACCESS_KEY = 'buddy.access';
const REFRESH_KEY = 'buddy.refresh';
const USER_KEY = 'buddy.user';

export interface PersistedAuth {
  access: string;
  refresh: string;
  user: SessionUserDto;
}

/**
 * Session store. Holds access/refresh tokens and the session user.
 * Access tokens are short-lived (15 min) and transparently rotated.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private userSignal = signal<SessionUserDto | null>(this.loadUser());
  private accessSignal = signal<string | null>(localStorage.getItem(ACCESS_KEY));
  private busyRefresh: Promise<boolean> | null = null;

  user = this.userSignal.asReadonly();
  access = this.accessSignal.asReadonly();
  isAuthed = computed(() => !!this.accessSignal() && !!this.userSignal());

  constructor(private http: HttpClient) {}

  private loadUser(): SessionUserDto | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as SessionUserDto) : null;
    } catch {
      return null;
    }
  }

  private persist(a: PersistedAuth) {
    localStorage.setItem(ACCESS_KEY, a.access);
    localStorage.setItem(REFRESH_KEY, a.refresh);
    localStorage.setItem(USER_KEY, JSON.stringify(a.user));
    this.accessSignal.set(a.access);
    this.userSignal.set(a.user);
  }

  register(payload: {
    username: string;
    email: string;
    password: string;
    birthDate: string;
    gender: string;
    acceptedTermsAt: string;
  }) {
    return this.http.post<AuthResponse>('/api/auth/register', payload).pipe(tap((r) => this.persist({ access: r.tokens.accessToken, refresh: r.tokens.refreshToken, user: r.user })));
  }

  login(payload: { usernameOrEmail: string; password: string }) {
    return this.http.post<AuthResponse>('/api/auth/login', payload).pipe(tap((r) => this.persist({ access: r.tokens.accessToken, refresh: r.tokens.refreshToken, user: r.user })));
  }

  logout() {
    const refresh = localStorage.getItem(REFRESH_KEY);
    if (refresh) this.http.post('/api/auth/logout', { refreshToken: refresh }).subscribe({ error: () => undefined });
    this.clear();
  }

  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    this.accessSignal.set(null);
    this.userSignal.set(null);
  }

  get refreshToken(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  }

  setFromRefresh(auth: PersistedAuth) {
    this.persist(auth);
  }

  on401(): Promise<boolean> {
    // Single-flight refresh to avoid stampede on parallel 401s.
    if (!this.busyRefresh) {
      this.busyRefresh = this.doRefresh().finally(() => (this.busyRefresh = null));
    }
    return this.busyRefresh;
  }

  private async doRefresh(): Promise<boolean> {
    const refresh = this.refreshToken;
    if (!refresh) return false;
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (!res.ok) {
        this.clear();
        return false;
      }
      const body = (await res.json()) as AuthResponse;
      this.persist({ access: body.tokens.accessToken, refresh: body.tokens.refreshToken, user: body.user });
      return true;
    } catch {
      return false;
    }
  }
}
