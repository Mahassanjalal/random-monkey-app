import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-safe pb-safe">
      <a routerLink="/" class="animate-fade-up flex items-center gap-2 py-4 text-ink-50/50 transition-colors hover:text-ink-50" aria-label="Back to home">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        Back
      </a>

      <main class="flex flex-1 flex-col justify-center py-4">
        <h1 class="animate-fade-up font-display text-3xl font-extrabold tracking-tight">Create your account</h1>
        <p class="animate-fade-up mt-2 text-sm text-ink-50/55" style="animation-delay: 60ms">Takes less than a minute.</p>

        <!-- age notice -->
        <div class="animate-fade-up glass-card mt-6 flex items-start gap-3 border-amber-400/20 bg-amber-400/5 p-4" style="animation-delay: 100ms">
          <span class="text-lg">🔞</span>
          <p class="text-[13px] leading-relaxed text-ink-50/70">
            Buddy is <strong class="text-ink-50">18+ only</strong>. Your birth date is used for age eligibility
            and is never shown to other users. Providing false information may lead to removal.
          </p>
        </div>

        <form (ngSubmit)="submit()" class="animate-fade-up mt-6 space-y-4" style="animation-delay: 140ms">
          <div>
            <label class="label" for="ru">Username</label>
            <input id="ru" class="input" [ngModel]="username()" (ngModelChange)="username.set($event)" name="username" required placeholder="e.g. cosmic_rider" autocomplete="username" />
          </div>
          <div>
            <label class="label" for="re">Email</label>
            <input id="re" class="input" type="email" [ngModel]="email()" (ngModelChange)="email.set($event)" name="email" required placeholder="you@mail.com" autocomplete="email" />
          </div>
          <div>
            <label class="label" for="rp">Password</label>
            <input id="rp" class="input" type="password" [ngModel]="password()" (ngModelChange)="password.set($event)" name="password" required placeholder="10+ chars, mixed case & digit" autocomplete="new-password" />
            <div class="mt-1.5 flex gap-1.5">
              <span class="h-1 flex-1 rounded-full transition-colors duration-300" [class]="ruleOk('lower') ? 'bg-mint' : 'bg-ink-50/10'"></span>
              <span class="h-1 flex-1 rounded-full transition-colors duration-300" [class]="ruleOk('upper') ? 'bg-mint' : 'bg-ink-50/10'"></span>
              <span class="h-1 flex-1 rounded-full transition-colors duration-300" [class]="ruleOk('digit') ? 'bg-mint' : 'bg-ink-50/10'"></span>
              <span class="h-1 flex-1 rounded-full transition-colors duration-300" [class]="ruleOk('length') ? 'bg-mint' : 'bg-ink-50/10'"></span>
            </div>
          </div>
          <div>
            <label class="label" for="rd">Birth date <span class="text-ink-50/35">(never shown publicly)</span></label>
            <input id="rd" class="input" type="date" [ngModel]="birthDate()" (ngModelChange)="birthDate.set($event)" name="birthDate" required [max]="maxDate" min="1920-01-01" />
          </div>
          <div>
            <span class="label">I am a…</span>
            <div class="grid grid-cols-2 gap-2">
              @for (g of genders; track g.v) {
                <button type="button" (click)="gender.set(g.v)"
                  class="rounded-2xl border px-4 py-3 text-sm font-medium transition-all duration-200 active:scale-95"
                  [class]="gender() === g.v
                    ? 'border-brand-400 bg-brand-500/15 text-ink-50'
                    : 'border-ink-50/10 bg-ink-50/[0.04] text-ink-50/60 hover:border-ink-50/20'">
                  {{ g.label }}
                </button>
              }
            </div>
          </div>

          <label class="flex cursor-pointer items-start gap-3 rounded-2xl border border-ink-50/10 bg-ink-50/[0.03] p-4">
            <input type="checkbox" class="mt-1 h-4 w-4 accent-[#7c4dff]" [ngModel]="accepted()" (ngModelChange)="accepted.set($event)" name="accepted" />
            <span class="text-[13px] leading-relaxed text-ink-50/65">
              I'm 18 or older and accept the <a routerLink="/safety" class="text-brand-300 underline underline-offset-2">Terms &amp; Community Guidelines</a>.
              I understand harassment, nudity and underage use lead to a ban.
            </span>
          </label>

          @if (error()) {
            <div class="animate-pop-in rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
              {{ error() }}
            </div>
          }

          <button class="btn-primary w-full !py-4" type="submit" [disabled]="busy()">
            @if (busy()) {
              <span class="inline-block h-5 w-5 animate-spin rounded-full border-2 border-ink-50/30 border-t-white"></span>
              Creating…
            } @else {
              Create account
            }
          </button>
        </form>

        <p class="animate-fade-up mt-6 text-center text-sm text-ink-50/50" style="animation-delay: 200ms">
          Already have an account?
          <a routerLink="/login" class="font-semibold text-brand-300 hover:text-brand-200">Sign in</a>
        </p>
      </main>
    </div>
  `,
})
export class RegisterPage {
  auth = inject(AuthService);
  router = inject(Router);
  toast = inject(ToastService);

  username = signal('');
  email = signal('');
  password = signal('');
  birthDate = signal('');
  gender = signal('');
  accepted = signal(false);
  error = signal<string | null>(null);
  busy = signal(false);

  genders = [
    { v: 'MALE', label: 'Man' },
    { v: 'FEMALE', label: 'Woman' },
    { v: 'NONBINARY', label: 'Non-binary' },
    { v: 'PREFER_NOT_SAY', label: 'Prefer not to say' },
  ];

  maxDate = new Date(Date.now() - 18 * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  ruleOk(k: 'lower' | 'upper' | 'digit' | 'length'): boolean {
    const p = this.password();
    switch (k) {
      case 'lower': return /[a-z]/.test(p);
      case 'upper': return /[A-Z]/.test(p);
      case 'digit': return /[0-9]/.test(p);
      case 'length': return p.length >= 10;
      default: return false;
    }
  }

  private validate(): string | null {
    const uname = this.username().trim();
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(uname)) return 'Username: 3–24 letters, numbers or underscores.';
    if (!/^\S+@\S+\.\S+$/.test(this.email())) return 'Please enter a valid email.';
    if (!(this.ruleOk('lower') && this.ruleOk('upper') && this.ruleOk('digit') && this.ruleOk('length'))) {
      return 'Password needs 10+ chars with upper, lower and a digit.';
    }
    if (!this.birthDate()) return 'Please enter your birth date.';
    if (this.birthDate() > this.maxDate) return 'You must be at least 18 years old.';
    if (!this.gender()) return 'Please pick what describes you.';
    if (!this.accepted()) return 'Please accept the terms to continue.';
    // client-side 18+ validation (server enforces authoritatively as well)
    const bd = new Date(this.birthDate());
    const age = (Date.now() - bd.getTime()) / (365.25 * 24 * 3600 * 1000);
    if (age < 18) return 'You must be at least 18 years old to use Buddy.';
    return null;
  }

  async submit() {
    const problem = this.validate();
    if (problem) {
      this.fail(problem);
      return;
    }
    const uname = this.username().trim();

    this.busy.set(true);
    this.error.set(null);
    this.auth
      .register({
        username: uname,
        email: this.email().trim(),
        password: this.password(),
        birthDate: this.birthDate(),
        gender: this.gender(),
        acceptedTermsAt: new Date().toISOString(),
      })
      .subscribe({
        next: () => {
          this.toast.success('Account created — welcome to Buddy! 🎉');
          this.router.navigateByUrl('/home');
        },
        error: (e) => {
          this.fail(e?.error?.message ?? 'Registration failed.');
          this.busy.set(false);
        },
      });
  }

  private fail(msg: string) {
    this.error.set(msg);
    this.busy.set(false);
    return false;
  }
}
