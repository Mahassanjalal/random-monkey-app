import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 pt-safe pb-safe">
      <!-- top bar -->
      <header class="animate-fade-up flex items-center justify-between py-4">
        <div class="flex items-center gap-2.5">
          <div class="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-fuchsia-500 shadow-lg shadow-brand-500/40">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          </div>
          <span class="font-display text-xl font-bold tracking-tight">Buddy</span>
        </div>
        <a routerLink="/login" class="btn-secondary !px-4 !py-2 text-sm">Sign in</a>
      </header>

      <!-- hero -->
      <main class="flex flex-1 flex-col justify-center py-8 text-center">
        <div class="animate-pop-in relative mx-auto mb-8">
          <div class="absolute inset-0 animate-pulse-ring rounded-full bg-brand-500/40"></div>
          <div class="absolute inset-0 rounded-full bg-gradient-to-br from-brand-500/60 to-fuchsia-500/40 blur-2xl"></div>
          <img
            src="hero-orb.svg"
            alt=""
            class="relative mx-auto h-44 w-44 animate-float select-none"
            draggable="false"
            aria-hidden="true"
          />
        </div>

        <h1 class="animate-fade-up font-display text-[2.6rem] font-extrabold leading-[1.05] tracking-tight" style="animation-delay: 80ms">
          Meet someone<br /><span class="bg-gradient-to-r from-brand-300 via-fuchsia-300 to-accent-mint bg-clip-text text-transparent">new, right now.</span>
        </h1>
        <p class="animate-fade-up mx-auto mt-4 max-w-sm text-[15px] leading-relaxed text-ink-50/60" style="animation-delay: 160ms">
          One tap and you're face-to-face with someone new. Skip anytime. Safe by design — 18+ only, block &amp; report always free.
        </p>

        <div class="animate-fade-up mt-9 space-y-3" style="animation-delay: 240ms">
          <a [routerLink]="authed() ? '/video' : '/register'" class="btn-primary w-full !py-4 text-base">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
            Start Video Chat
          </a>
          <a [routerLink]="authed() ? '/text' : '/register'" class="btn-secondary w-full !py-4 text-base">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Start Text Chat
          </a>
        </div>

        <div class="animate-fade-up mt-6 flex items-center justify-center gap-2 text-xs text-ink-50/40" style="animation-delay: 300ms">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          18+ only · AI-assisted moderation · you're always in control
        </div>
      </main>

      <!-- features -->
      <section class="animate-fade-up grid grid-cols-3 gap-3 pb-6" style="animation-delay: 380ms" aria-label="Why Buddy">
        <div class="glass-card p-4 text-center">
          <div class="mb-2 text-2xl">⚡</div>
          <div class="font-display text-[13px] font-semibold">Instant match</div>
          <div class="mt-1 text-[11px] leading-snug text-ink-50/45">Paired in seconds</div>
        </div>
        <div class="glass-card p-4 text-center">
          <div class="mb-2 text-2xl">🛡️</div>
          <div class="font-display text-[13px] font-semibold">Safe by design</div>
          <div class="mt-1 text-[11px] leading-snug text-ink-50/45">Skip · block · report</div>
        </div>
        <div class="glass-card p-4 text-center">
          <div class="mb-2 text-2xl">🎁</div>
          <div class="font-display text-[13px] font-semibold">Free core</div>
          <div class="mt-1 text-[11px] leading-snug text-ink-50/45">Premium extras</div>
        </div>
      </section>

      <footer class="flex items-center justify-center gap-4 pb-2 text-[11px] text-ink-50/35">
        <a routerLink="/safety" class="hover:text-ink-50/60">Safety Center</a>
        <span>·</span>
        <a routerLink="/safety" class="hover:text-ink-50/60">18+ Terms</a>
        <span>·</span>
        <a routerLink="/safety" class="hover:text-ink-50/60">Privacy</a>
      </footer>
    </div>
  `,
})
export class LandingPage {
  auth = inject(AuthService);
  authed = this.auth.isAuthed;
}
