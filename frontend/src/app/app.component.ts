import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from './core/auth.service';
import { ThemeService } from './core/theme.service';
import { AvatarComponent, ToastsComponent, AnimatedOutletComponent } from './shared/ui';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, AvatarComponent, ToastsComponent, AnimatedOutletComponent],
  template: `
    <!-- ambient aurora backdrop -->
    <div class="fixed inset-0 -z-10 overflow-hidden">
      <div class="aurora-blob h-[420px] w-[420px] bg-brand-600/25 -top-24 -right-24"></div>
      <div class="aurora-blob h-[360px] w-[360px] bg-fuchsia-600/15 top-1/3 -left-32" style="animation-delay: -6s"></div>
      <div class="aurora-blob h-[300px] w-[300px] bg-accent-mint/10 bottom-0 right-1/4" style="animation-delay: -12s"></div>
    </div>

    <app-animated-outlet />

    <!-- mobile bottom navigation -->
    @if (authed()) {
      <nav
        class="fixed inset-x-0 bottom-0 z-50 border-t border-ink-50/10 bg-ink-900/80 pb-safe backdrop-blur-xl"
        aria-label="Primary"
      >
        <div class="mx-auto grid max-w-md grid-cols-4">
          <a
            [routerLink]="authed() ? '/home' : ''"
            routerLinkActive="text-brand-300"
            #rla="routerLinkActive"
            class="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors"
            [class]="rla.isActive ? 'text-brand-300' : 'text-ink-50/50'"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>
            Home
          </a>
          <a
            routerLink="/friends"
            routerLinkActive
            #rla2="routerLinkActive"
            class="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors"
            [class]="rla2.isActive ? 'text-brand-300' : 'text-ink-50/50'"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M15.5 15.5c2.6.3 4.6 1.8 5.5 4.5"/></svg>
            Friends
          </a>
          <a
            routerLink="/settings"
            routerLinkActive
            #rla3="routerLinkActive"
            class="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors"
            [class]="rla3.isActive ? 'text-brand-300' : 'text-ink-50/50'"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>
            Settings
          </a>
          <a
            routerLink="/profile"
            routerLinkActive
            #rla4="routerLinkActive"
            class="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors"
            [class]="rla4.isActive ? 'text-brand-300' : 'text-ink-50/50'"
          >
            <app-avatar [name]="auth.user()?.username ?? '?'" [size]="22" />
            Profile
          </a>
        </div>
      </nav>
    }
    <app-toasts />
  `,
})
export class AppComponent {
  auth = inject(AuthService);
  router = inject(Router);
  theme = inject(ThemeService);
  authed = computed(() => this.auth.isAuthed());
}
