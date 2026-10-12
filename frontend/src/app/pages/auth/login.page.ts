import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-safe pb-safe">
      <a routerLink="/" class="animate-fade-up flex items-center gap-2 py-4 text-ink-50/50 transition-colors hover:text-ink-50" aria-label="Back to home">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        Back
      </a>

      <main class="flex flex-1 flex-col justify-center">
        <h1 class="animate-fade-up font-display text-3xl font-extrabold tracking-tight">Welcome back 👋</h1>
        <p class="animate-fade-up mt-2 text-sm text-ink-50/55" style="animation-delay: 60ms">Sign in to keep meeting new people.</p>

        <form (ngSubmit)="submit()" class="animate-fade-up mt-8 space-y-4" style="animation-delay: 120ms">
          <div>
            <label class="label" for="lid">Username or email</label>
            <input id="lid" class="input" type="text" autocomplete="username" [ngModel]="username()" (ngModelChange)="username.set($event)" name="username" required placeholder="you or you@mail.com" />
          </div>
          <div>
            <label class="label" for="pwd">Password</label>
            <input id="pwd" class="input" type="password" autocomplete="current-password" [ngModel]="password()" (ngModelChange)="password.set($event)" name="password" required placeholder="••••••••" />
          </div>

          @if (error()) {
            <div class="animate-pop-in rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
              {{ error() }}
            </div>
          }

          <button class="btn-primary w-full !py-4" type="submit" [disabled]="busy()">
            @if (busy()) {
              <span class="inline-block h-5 w-5 animate-spin rounded-full border-2 border-ink-50/30 border-t-white"></span>
              Signing in…
            } @else {
              Sign in
            }
          </button>
        </form>

        <p class="animate-fade-up mt-6 text-center text-sm text-ink-50/50" style="animation-delay: 180ms">
          New here?
          <a routerLink="/register" class="font-semibold text-brand-300 hover:text-brand-200">Create an account</a>
        </p>
      </main>
    </div>
  `,
})
export class LoginPage {
  auth = inject(AuthService);
  router = inject(Router);
  toast = inject(ToastService);

  username = signal('');
  password = signal('');
  error = signal<string | null>(null);
  busy = signal(false);

  async submit() {
    if (!this.username().trim() || !this.password()) {
      this.error.set('Please fill in both fields.');
      return;
    }
    this.error.set(null);
    this.busy.set(true);
    try {
      this.auth.login({ usernameOrEmail: this.username().trim(), password: this.password() }).subscribe({
        next: () => {
          this.toast.success('Signed in — welcome back!');
          this.router.navigateByUrl('/home');
        },
        error: (e) => {
          this.error.set(e?.error?.message ?? 'Sign-in failed. Check your credentials.');
          this.busy.set(false);
        },
      });
    } catch {
      this.busy.set(false);
      this.error.set('Unexpected error.');
    }
  }
}
