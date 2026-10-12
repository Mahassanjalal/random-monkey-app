import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { ApiService } from '../../core/api.service';
import { ThemeService } from '../../core/theme.service';
import { AvatarComponent } from '../../shared/ui';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, AvatarComponent],
  template: `
    <div class="mx-auto w-full max-w-lg px-5 pt-safe pb-28">
      <!-- header -->
      <header class="animate-fade-up flex items-center justify-between pb-6 pt-4">
        <div class="flex items-center gap-3">
          <app-avatar [name]="auth.user()?.username ?? '?'" [hue]="hue()" [size]="42" />
          <div>
            <div class="font-display text-[15px] font-bold leading-tight">
              Hey, {{ auth.user()?.username }} 👋
            </div>
            <div class="flex items-center gap-1.5 text-[11px] text-ink-50/45">
              <span class="h-1.5 w-1.5 rounded-full bg-mint animate-pulse"></span>
              {{ online() ? 'You are online' : 'Connecting…' }} · {{ onlineCount() }} people around
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button
            (click)="theme.toggle()"
            class="chip cursor-pointer !px-2.5 !py-2 transition-colors hover:bg-ink-50/10"
            [attr.aria-label]="theme.isLight ? 'Switch to dark mode' : 'Switch to light mode'"
            [title]="theme.isLight ? 'Switch to dark mode' : 'Switch to light mode'">
            {{ theme.isLight ? '🌙' : '☀️' }}
          </button>
          <a routerLink="/premium" class="chip !border-brand-400/40 !bg-brand-500/10 !text-brand-200 cursor-pointer hover:!bg-brand-500/20 transition-colors">
            {{ tier() === 'PREMIUM' ? '✨ Premium' : 'Go Premium' }}
          </a>
        </div>
      </header>

      <!-- hero action -->
      <section class="animate-fade-up glass-card relative overflow-hidden p-6" style="animation-delay: 60ms">
        <div class="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-500/20 blur-3xl"></div>
        <h2 class="font-display text-2xl font-extrabold tracking-tight">Who's up next?</h2>
        <p class="mt-1 text-sm text-ink-50/55">Pick how you want to meet. Skip anytime, no hard feelings.</p>

        <div class="mt-5 space-y-3">
          <button (click)="startVideo()" class="btn-primary w-full !py-4" [disabled]="starting()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
            {{ starting() === 'VIDEO' ? 'Finding someone…' : 'Start Video Chat' }}
          </button>
          <button (click)="startText()" class="btn-secondary w-full !py-4" [disabled]="starting()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            {{ starting() === 'TEXT' ? 'Finding someone…' : 'Start Text Chat' }}
          </button>
        </div>

        <p class="mt-4 text-center text-[11px] text-ink-50/35">Matches respect everyone's preferences — yours included.</p>
      </section>

      <!-- quick links -->
      <section class="animate-fade-up mt-5 grid grid-cols-2 gap-3" style="animation-delay: 120ms">
        <a routerLink="/settings" class="glass-card group p-4 transition-all duration-300 hover:border-brand-400/40 hover:bg-brand-500/[0.06] active:scale-[0.98]">
          <div class="mb-2 text-xl">🎛️</div>
          <div class="font-display text-[13px] font-semibold">Matching prefs</div>
          <div class="mt-0.5 text-[11px] text-ink-50/45">Who you meet</div>
        </a>
        <a routerLink="/safety" class="glass-card p-4 transition-all duration-300 hover:border-mint/40 hover:bg-mint/[0.05] active:scale-[0.98]">
          <div class="mb-2 text-xl">🛡️</div>
          <div class="font-display text-[13px] font-semibold">Safety center</div>
          <div class="mt-0.5 text-[11px] text-ink-50/45">Tools &amp; tips</div>
        </a>
      </section>

      <!-- stats -->
      <section class="animate-fade-up mt-5" style="animation-delay: 180ms">
        <div class="mb-2 flex items-center justify-between px-1">
          <span class="text-[13px] font-semibold text-ink-50/80">Your week</span>
          <a routerLink="/profile" class="text-[11px] text-brand-300 hover:text-brand-200">View profile →</a>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div class="glass-card p-3.5 text-center">
            <div class="font-display text-xl font-extrabold text-brand-300">{{ stats()?.matches ?? '–' }}</div>
            <div class="mt-0.5 text-[11px] text-ink-50/45">Matches</div>
          </div>
          <div class="glass-card p-3.5 text-center">
            <div class="font-display text-xl font-extrabold text-fuchsia-300">{{ stats()?.messages ?? '–' }}</div>
            <div class="mt-0.5 text-[11px] text-ink-50/45">Messages</div>
          </div>
          <div class="glass-card p-3.5 text-center">
            <div class="font-display text-xl font-extrabold text-mint">✓</div>
            <div class="mt-0.5 text-[11px] text-ink-50/45">Verified-ready</div>
          </div>
        </div>
      </section>
    </div>
  `,
})
export class HomePage implements OnInit, OnDestroy {
  auth = inject(AuthService);
  api = inject(ApiService);
  router = inject(Router);
  theme = inject(ThemeService);

  hue = signal(210);
  online = signal(false);
  onlineCount = signal(0);
  tier = signal<'FREE' | 'PREMIUM'>('FREE');
  stats = signal<{ matches: number; messages: number } | null>(null);
  starting = signal<'VIDEO' | 'TEXT' | null>(null);
  private presenceTimer: ReturnType<typeof setInterval> | null = null;

  async ngOnInit() {
    try {
      const [me, ent, s] = await Promise.all([
        firstValueFrom(this.api.me()),
        firstValueFrom(this.api.entitlements()),
        firstValueFrom(this.api.myStats()),
      ]);
      this.hue.set(me?.profile?.avatarHue ?? 210);
      this.tier.set(ent?.tier ?? 'FREE');
      this.stats.set(s ?? null);
    } catch {
      this.online.set(false);
    }
    // Live presence: refresh the online count while the dashboard is visible.
    void this.refreshPresence();
    this.presenceTimer = setInterval(() => void this.refreshPresence(), 20_000);
  }

  ngOnDestroy() {
    if (this.presenceTimer) clearInterval(this.presenceTimer);
  }

  private async refreshPresence() {
    try {
      const q = await firstValueFrom(this.api.analyticsQueue());
      this.onlineCount.set(q?.online ?? 0);
      this.online.set(true);
    } catch {
      this.online.set(false);
    }
  }

  async startVideo() {
    if (this.starting()) return;
    this.starting.set('VIDEO');
    try {
      await this.router.navigateByUrl('/video');
    } finally {
      this.starting.set(null);
    }
  }

  async startText() {
    if (this.starting()) return;
    this.starting.set('TEXT');
    try {
      await this.router.navigateByUrl('/text');
    } finally {
      this.starting.set(null);
    }
  }
}
