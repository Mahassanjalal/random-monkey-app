import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { Router } from '@angular/router';

interface AdminMetrics {
  users: { total: number; activeToday: number; suspended: number; banned: number };
  reports: { open: number; bySeverity: Record<string, number> };
  matches: { last24h: number; activeNow: number };
  revenue: { activeSubs: number };
}

@Component({
  selector: 'app-admin-page',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="mx-auto w-full max-w-lg px-5 pt-safe pb-28">
      <header class="animate-fade-up flex items-center justify-between py-4">
        <button class="text-ink-50/60 transition-colors hover:text-ink-50" (click)="back()" aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <h1 class="font-display text-lg font-bold">Admin</h1>
        <span class="chip !border-brand-400/40 !text-brand-200"> ℝ {{ role() }}</span>
      </header>

      @if (denied()) {
        <div class="glass-card p-10 text-center">
          <div class="mb-3 text-4xl">🔒</div>
          <p class="text-sm text-ink-50/60">Your account doesn't have admin access.</p>
        </div>
      } @else if (loading()) {
        <div class="space-y-4"><div class="skeleton h-40"></div><div class="skeleton h-24"></div></div>
      } @else {
        <!-- metrics -->
        <section class="animate-fade-up grid grid-cols-2 gap-3" style="animation-delay: 40ms">
          <div class="glass-card p-4">
            <div class="text-[11px] text-ink-50/45">Total users</div>
            <div class="font-display text-2xl font-extrabold text-brand-300">{{ m()?.users?.total ?? '–' }}</div>
            <div class="mt-0.5 text-[10px] text-ink-50/35">{{ m()?.users?.activeToday ?? 0 }} active today</div>
          </div>
          <div class="glass-card p-4">
            <div class="text-[11px] text-ink-50/45">Matches (24h)</div>
            <div class="font-display text-2xl font-extrabold text-fuchsia-300">{{ m()?.matches?.last24h ?? '–' }}</div>
            <div class="mt-0.5 text-[10px] text-ink-50/35">{{ m()?.matches?.activeNow ?? 0 }} live now</div>
          </div>
          <div class="glass-card p-4">
            <div class="text-[11px] text-ink-50/45">Open reports</div>
            <div class="font-display text-2xl font-extrabold text-amber-300">{{ m()?.reports?.open ?? '–' }}</div>
            <div class="mt-0.5 text-[10px] text-ink-50/35">HIGH: {{ m()?.reports?.bySeverity?.['HIGH'] ?? 0 }} · CRIT: {{ m()?.reports?.bySeverity?.['CRITICAL'] ?? 0 }}</div>
          </div>
          <div class="glass-card p-4">
            <div class="text-[11px] text-ink-50/45">Enforcement</div>
            <div class="font-display text-2xl font-extrabold text-red-300">{{ (m()?.users?.suspended ?? 0) + (m()?.users?.banned ?? 0) }}</div>
            <div class="mt-0.5 text-[10px] text-ink-50/35">{{ m()?.users?.suspended ?? 0 }} susp · {{ m()?.users?.banned ?? 0 }} bans</div>
          </div>
        </section>

        <!-- users -->
        <section class="animate-fade-up glass-card mt-4 p-5" style="animation-delay: 80ms">
          <h2 class="mb-3 font-display text-[15px] font-bold">Users</h2>
          <input class="input !py-3 mb-3" placeholder="Search username…" (input)="onSearch($event)" />
          <div class="space-y-2">
            @for (u of users(); track u.id) {
              <div class="flex items-center justify-between rounded-2xl bg-ink-50/[0.04] px-4 py-3">
                <div class="min-w-0">
                  <div class="truncate font-display text-sm font-semibold">{{ u.username }}</div>
                  <div class="text-[10px] text-ink-50/40">{{ u.status }} · {{ u.role }} · {{ u.ageAssurance }}</div>
                </div>
                <div class="flex shrink-0 gap-1.5">
                  @if (u.status === 'ACTIVE') {
                    <button (click)="setStatus(u.id, 'SUSPENDED')" class="chip !px-3 hover:!bg-amber-400/20 transition-colors">Suspend</button>
                    <button (click)="setStatus(u.id, 'BANNED')" class="chip !px-3 hover:!bg-red-400/20 transition-colors">Ban</button>
                  } @else if (u.status === 'SUSPENDED') {
                    <button (click)="setStatus(u.id, 'ACTIVE')" class="chip !px-3 hover:!bg-mint/20 transition-colors">Restore</button>
                  }
                </div>
              </div>
            }
          </div>
        </section>

        <!-- cases -->
        <section class="animate-fade-up glass-card mt-4 p-5" style="animation-delay: 120ms">
          <h2 class="mb-3 font-display text-[15px] font-bold">Moderation cases</h2>
          @if (cases().length === 0) {
            <p class="text-sm text-ink-50/40">No open cases 🎉</p>
          }
          <div class="space-y-2">
            @for (c of cases(); track c.id) {
              <div class="rounded-2xl bg-ink-50/[0.04] px-4 py-3">
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium">{{ c.reason }} <span class="text-ink-50/40">· {{ c.source }}</span></span>
                  <span class="chip" [class]="sevClass(c.severity)">{{ c.severity }}</span>
                </div>
                <div class="mt-1 text-[10px] text-ink-50/40">subject {{ (c.subjectUserId || '').slice(0, 8) }}… · {{ c.status }}</div>
                @if (canAct()) {
                  <div class="mt-2 flex gap-1.5">
                    <button (click)="act(c.id, 'WARN')" class="chip !px-3">Warn</button>
                    <button (click)="act(c.id, 'SUSPEND')" class="chip !px-3">Suspend</button>
                    <button (click)="act(c.id, 'BAN')" class="chip !px-3">Ban</button>
                    <button (click)="act(c.id, 'DISMISS_CASE')" class="chip !px-3">Dismiss</button>
                  </div>
                }
              </div>
            }
          </div>
        </section>

        <!-- audit -->
        <section class="animate-fade-up glass-card mt-4 p-5" style="animation-delay: 160ms">
          <h2 class="mb-3 font-display text-[15px] font-bold">Audit log</h2>
          @if (canSeeAudit()) {
            <div class="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              @for (a of audit(); track a.id) {
                <div class="rounded-xl bg-ink-50/[0.03] px-3 py-2 text-[12px]">
                  <span class="font-medium text-ink-50/80">{{ a.action }}</span>
                  <span class="text-ink-50/35"> · {{ a.createdAt | date:'MMM d, HH:mm' }}</span>
                </div>
              }
            </div>
          } @else {
            <p class="text-sm text-ink-50/40">Audit log requires elevated role.</p>
          }
        </section>
      }
    </div>
  `,
})
export class AdminPage implements OnInit, OnDestroy {
  http = inject(HttpClient);
  auth = inject(AuthService);
  toast = inject(ToastService);
  router = inject(Router);

  loading = signal(true);
  denied = signal(false);
  m = signal<AdminMetrics | null>(null);
  users = signal<{ id: string; username: string; status: string; role: string; ageAssurance: string }[]>([]);
  cases = signal<{ id: string; reason: string; severity: string; source: string; status: string; subjectUserId: string }[]>([]);
  audit = signal<{ id: string; action: string; createdAt: string }[]>([]);

  role() { return this.auth.user()?.role ?? 'USER'; }
  canAct() { return ['ADMIN', 'MODERATOR'].includes(this.role()); }
  canSeeAudit() { return this.role() === 'ADMIN' || this.role() === 'SUPPORT'; }

  sevClass(sev: string) {
    return sev === 'CRITICAL' ? '!border-red-400/50 !bg-red-500/15 !text-red-200'
      : sev === 'HIGH' ? '!border-amber-400/50 !bg-amber-400/10 !text-amber-200' : '!border-ink-50/15';
  }

  async ngOnInit() {
    if (this.role() === 'USER') {
      this.denied.set(true);
      this.loading.set(false);
      return;
    }
    await this.refresh();
    this.loading.set(false);
  }

  async refresh(q = '') {
    try {
      const [metrics, users, cases] = await Promise.all([
        firstValueFrom(this.http.get<AdminMetrics>('/api/admin/metrics')),
        firstValueFrom(
          this.http.get<{ rows: { id: string; username: string; status: string; role: string; ageAssurance: string }[] }>(
            `/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`,
          ),
        ),
        firstValueFrom(
          this.http.get<{ id: string; reason: string; severity: string; source: string; status: string; subjectUserId: string }[]>(
            '/api/admin/cases',
          ),
        ),
      ]);
      this.m.set(metrics ?? null);
      this.users.set(users?.rows ?? []);
      this.cases.set(cases ?? []);
      if (this.canSeeAudit()) {
        const audit = await firstValueFrom(
          this.http.get<{ id: string; action: string; createdAt: string }[]>('/api/admin/audit'),
        );
        this.audit.set(audit ?? []);
      }
    } catch {
      this.denied.set(true);
    }
  }

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  onSearch(ev: Event) {
    const q = (ev.target as HTMLInputElement).value.trim();
    if (q === '') {
      void this.refresh();
      return;
    }
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.refresh(q), 300);
  }

  async setStatus(id: string, status: string) {
    try {
      await firstValueFrom(this.http.post(`/api/admin/users/${id}/status`, { status }));
      this.toast.success(`User ${status.toLowerCase()}`);
      await this.refresh();
    } catch {
      this.toast.error('Action failed');
    }
  }

  async act(caseId: string, action: string) {
    try {
      await firstValueFrom(this.http.post(`/api/admin/cases/${caseId}`, { action }));
      this.toast.success(`Case ${caseId.slice(0, 6)} → ${action.toLowerCase()}`);
      await this.refresh();
    } catch {
      this.toast.error('Action failed');
    }
  }

  back() {
    void this.router.navigateByUrl('/home');
  }

  ngOnDestroy() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }
}
