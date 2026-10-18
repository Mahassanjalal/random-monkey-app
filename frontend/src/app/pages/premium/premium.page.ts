import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import type { CreditProductDto } from '@bundle/shared';

const FEATURES_FREE = ['Random video & text matching', 'Preference matching (everyone / women / men)', 'Skip, block & report — always', 'Safety center & controls', 'Friends & profile'];
const FEATURES_PREMIUM = ['Pick verified people only', 'Language & country filters', 'Extended interest matching', 'Priority queue placement', 'Premium badge on profile', 'Priority support'];

function newIdempotencyKey() {
  return `${crypto.randomUUID().replace(/-/g, '')}-${Date.now()}`;
}

@Component({
  selector: 'app-premium-page',
  standalone: true,
  imports: [],
  template: `
    <div class="mx-auto w-full max-w-lg px-5 pt-safe pb-28">
      <header class="animate-fade-up flex items-center justify-between py-4">
        <button class="text-ink-50/60 transition-colors hover:text-ink-50" (click)="back()" aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <h1 class="font-display text-lg font-bold">Buddy Premium</h1>
        <span class="w-5"></span>
      </header>

      @if (tier() === 'PREMIUM') {
        <section class="animate-fade-up glass-card p-6 text-center">
          <div class="mx-auto mb-3 w-fit">
            <div class="animate-float bg-gradient-to-br from-amber-400 to-brand-400 text-5xl badge-shadow rounded-3xl p-4">✨</div>
          </div>
          <h2 class="font-display text-2xl font-extrabold bg-gradient-to-r from-amber-200 to-brand-300 bg-clip-text text-transparent">You're Premium</h2>
          <p class="mt-2 text-sm text-ink-50/55">All filters unlocked, priority queue active.</p>
          <p class="mt-1 text-[11px] text-ink-50/40">Active until {{ activeUntil() }}</p>
          <button class="btn-secondary mt-5 w-full !py-3 text-sm" (click)="cancel()" [disabled]="busy()">Cancel subscription</button>
        </section>
        <section class="mt-4 glass-card p-5" style="animation-delay: 60ms">
          <h3 class="mb-3 font-display text-[13px] font-bold text-ink-50/75">What's included</h3>
          <ul class="space-y-2.5 text-sm">
            @for (f of featuresPremium; track f) {
              <li class="flex items-center gap-2.5 text-ink-50/70"><span class="text-mint">✓</span> {{ f }}</li>
            }
          </ul>
        </section>
      } @else {
        <!-- hero -->
        <section class="animate-fade-up glass-card relative overflow-hidden p-6 text-center">
          <div class="absolute -right-14 -top-14 h-40 w-40 rounded-full bg-gradient-to-br from-amber-400/30 to-brand-500/30 blur-3xl"></div>
          <div class="relative">
            <div class="mx-auto mb-3 w-fit animate-float text-5xl">✨</div>
            <h2 class="font-display text-2xl font-extrabold">Meet better, faster</h2>
            <p class="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-ink-50/55">
              Premium unlocks filters that help you find the right people — while keeping all essential safety tools free for everyone.
            </p>
          </div>
        </section>

        <!-- comparison -->
        <section class="animate-fade-up mt-4 grid gap-3" style="animation-delay: 80ms">
          <div class="glass-card p-5">
            <h3 class="font-display text-[15px] font-bold text-ink-50/85">Free — for everyone</h3>
            <ul class="mt-3 space-y-2.5 text-sm">
              @for (f of featuresFree; track f) {
                <li class="flex items-center gap-2.5 text-ink-50/65"><span class="text-mint">✓</span> {{ f }}</li>
              }
            </ul>
          </div>
          <div class="glass-card border-brand-400/30 bg-brand-500/[0.06] p-5">
            <div class="flex items-center justify-between">
              <h3 class="font-display text-[15px] font-bold text-ink-50">Premium</h3>
              <span class="chip !border-amber-400/40 !bg-amber-400/10 !text-amber-200">Popular</span>
            </div>
            <ul class="mt-3 space-y-2.5 text-sm">
              @for (f of featuresPremium; track f) {
                <li class="flex items-center gap-2.5 text-ink-50/80"><span class="text-brand-300">★</span> {{ f }}</li>
              }
            </ul>
          </div>
        </section>

        <!-- plans -->
        @if (plans().length > 0) {
          <section class="animate-fade-up mt-4 space-y-3" style="animation-delay: 120ms">
            @for (p of plans(); track p.key) {
              <button (click)="checkout(p.key)" [disabled]="busy()"
                class="glass-card flex w-full items-center justify-between p-5 text-left transition-all duration-300 hover:border-brand-400/50 hover:bg-brand-500/[0.08] active:scale-[0.99]">
                <div>
                  <div class="font-display text-base font-bold">{{ p.interval === 'month' ? 'Monthly' : 'Yearly' }}</div>
                  <div class="mt-0.5 text-[12px] text-ink-50/45">{{ p.interval === 'month' ? 'Billed every month' : 'Save 30% — best value' }}</div>
                </div>
                <div class="text-right">
                  <div class="font-display text-xl font-extrabold text-brand-300">{{ cents(p.priceCents, p.currency) }}</div>
                  <div class="text-[11px] text-ink-50/40">per {{ p.interval }}</div>
                </div>
              </button>
            }
          </section>
          @if (!configured()) {
            <p class="animate-fade-up mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-center text-[11px] text-amber-100/70" style="animation-delay: 160ms">
              ⚠️ Billing isn't configured on this server. You can activate Premium in dev mode for testing.
            </p>
            <button class="btn-secondary mt-2 w-full !py-3 text-sm" (click)="devActivate()" [disabled]="busy()">Activate dev-mode Premium</button>
          }
        }
      }

      <!-- credit packs -->
      @if (creditProducts().length > 0) {
        <section class="animate-fade-up mt-4 space-y-2" style="animation-delay: 140ms">
          <h3 class="font-display text-[13px] font-bold text-ink-50/75">Credit packs</h3>
          <div class="grid grid-cols-2 gap-3">
            @for (p of creditProducts(); track p.key) {
              <button (click)="buyCredits(p)" [disabled]="busy()"
                class="glass-card flex flex-col items-center justify-between p-4 text-center transition-all duration-300 hover:border-brand-400/50 hover:bg-brand-500/[0.08] active:scale-[0.99]">
                <div class="text-[11px] font-bold text-ink-50/60 mb-1">{{ p.name }}</div>
                <div class="font-display text-lg font-extrabold text-brand-300 mb-1">{{ cents(p.priceCents, p.currency) }}</div>
                <div class="text-[10px] text-ink-50/45 mb-3">{{ p.credits }} credits</div>
                <span class="text-[10px] text-mint-400 font-bold">+{{ p.credits }}</span>
              </button>
            }
          </div>
        </section>
      }

      <p class="animate-fade-up mt-6 text-center text-[11px] text-ink-50/35" style="animation-delay: 200ms">
        Cancel anytime in settings. Payments processed securely by our provider.<br />Essential safety tools are always free.
      </p>
    </div>
  `,
})
export class PremiumPage implements OnInit {
  api = inject(ApiService);
  toast = inject(ToastService);
  router = inject(Router);

  tier = signal<'FREE' | 'PREMIUM'>('FREE');
  plans = signal<{ key: string; priceCents: number; currency: string; interval: string }[]>([]);
  configured = signal(false);
  activeUntil = signal('');
  creditProducts = signal<CreditProductDto[]>([]);
  busy = signal(false);

  featuresFree = FEATURES_FREE;
  featuresPremium = FEATURES_PREMIUM;

  cents(c: number, cur: string) {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, minimumFractionDigits: 2 }).format(c / 100);
  }

  async ngOnInit() {
    try {
      const [ent, pl, cp] = await Promise.all([
        firstValueFrom(this.api.entitlements()),
        firstValueFrom(this.api.plans()),
        firstValueFrom(this.api.creditProducts()),
      ]);
      this.tier.set(ent?.tier ?? 'FREE');
      this.activeUntil.set(ent?.activeUntil ? new Date(ent.activeUntil).toLocaleDateString() : '');
      this.plans.set((pl?.plans ?? []) as never[]);
      this.configured.set(!!pl?.configured);
      this.creditProducts.set(cp?.products ?? []);
      const params = new URLSearchParams(window.location.search);
      const status = params.get('status');
      if (status === 'success') this.toast.success('Payment successful — premium activating…');
      else if (status === 'cancel') this.toast.info('Checkout canceled — no charge made.');
    } catch {
      this.toast.error('Could not load plans');
    }
  }

  async checkout(planKey: string) {
    this.busy.set(true);
    try {
      const r = await firstValueFrom(this.api.checkout(planKey));
      if (r?.mode === 'DEV_MODE') {
        this.toast.info('Dev mode: activating without billing…');
        await firstValueFrom(this.api.devActivate(planKey));
        this.toast.success('Premium activated (dev mode)');
        await this.ngOnInit();
      } else if (r?.url) {
        window.location.href = r.url;
      } else {
        this.toast.error('Checkout unavailable right now');
      }
    } catch {
      this.toast.error('Checkout unavailable right now');
    } finally {
      this.busy.set(false);
    }
  }

  async devActivate() {
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.devActivate('premium_monthly'));
      this.toast.success('Premium activated (dev mode)');
      await this.ngOnInit();
    } catch {
      this.toast.error('Activation failed');
    } finally {
      this.busy.set(false);
    }
  }

  async buyCredits(product: CreditProductDto) {
    this.busy.set(true);
    try {
      const r = await firstValueFrom(this.api.buyCredits(product.key, newIdempotencyKey()));
      if (r?.mode === 'DEV_MODE' || r?.mode === 'IDEMPOTENT') {
        this.toast.success(`Credits added: +${product.credits}`);
        await this.ngOnInit();
      } else if (r?.url) {
        window.location.href = r.url;
      } else {
        this.toast.error('Purchase unavailable right now');
      }
    } catch {
      this.toast.error('Purchase failed');
    } finally {
      this.busy.set(false);
    }
  }

  async cancel() {
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.cancelSubscription());
      this.toast.info('Subscription canceled — access continues until period end.');
      await this.ngOnInit();
    } catch {
      this.toast.error('Cancel failed — try again.');
    } finally {
      this.busy.set(false);
    }
  }

  back() {
    void this.router.navigateByUrl('/home');
  }
}
