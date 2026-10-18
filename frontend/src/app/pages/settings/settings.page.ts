import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { OnlineVisibility, SeekingPreference } from '@bundle/shared';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { ThemeService, type ThemeMode } from '../../core/theme.service';
import type { GeoLocationDto } from '@bundle/shared';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="mx-auto w-full max-w-lg px-5 pt-safe pb-28">
      <header class="animate-fade-up flex items-center justify-between py-4">
        <button class="text-ink-50/60 transition-colors hover:text-ink-50" (click)="back()" aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <h1 class="font-display text-lg font-bold">Settings</h1>
        <span class="w-5"></span>
      </header>

      @if (loading()) {
        <div class="space-y-4"><div class="skeleton h-24"></div><div class="skeleton h-40"></div><div class="skeleton h-24"></div></div>
      } @else {
        <!-- Appearance -->
        <section class="animate-fade-up glass-card p-5">
          <h2 class="mb-3 font-display text-[15px] font-bold">Appearance</h2>
          <div class="grid grid-cols-3 gap-2">
            @for (o of themeOptions; track o.v) {
              <button
                (click)="theme.setMode(o.v)"
                class="flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 transition-all active:scale-95"
                [class]="theme.mode() === o.v ? 'border-brand-400 bg-brand-500/15' : 'border-ink-50/10 bg-ink-50/[0.03]'"
                [attr.aria-pressed]="theme.mode() === o.v">
                <span class="text-lg leading-none">{{ o.icon }}</span>
                <span class="text-[12px] font-medium"> {{ o.label }}</span>
              </button>
            }
          </div>
        </section>

        <!-- Matching preferences -->
        <section class="animate-fade-up glass-card mt-4 p-5">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="font-display text-[15px] font-bold">Matching preferences</h2>
            @if (!premium()) {
              <a routerLink="/premium" class="chip !border-brand-400/40 !bg-brand-500/10 !text-brand-200 text-[11px]">✨ Unlock filters</a>
            }
          </div>

          <span class="label">I want to meet</span>
          <div class="space-y-2">
            @for (o of seekingOptions; track o.v) {
              <button (click)="seeking.set(o.v); autoSave()"
                class="flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm transition-all duration-200 active:scale-[0.99]"
                [class]="seeking() === o.v ? 'border-brand-400 bg-brand-500/15' : 'border-ink-50/10 bg-ink-50/[0.03]'">
                <span class="font-medium">{{ o.label }}</span>
                @if (seeking() === o.v) { <span class="text-brand-300">✓</span> }
              </button>
            }
          </div>

          @if (premium()) {
            <div class="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label class="label" for="lang">Language</label>
                <select id="lang" class="input !py-3" [ngModel]="language()" (ngModelChange)="language.set($event)" name="language" (change)="autoSave()">
                  <option value="">Any language</option>
                  @for (l of langs; track l) { <option [value]="l">{{ l }}</option> }
                </select>
              </div>
              <div>
                <label class="label" for="country">Country</label>
                <select id="country" class="input !py-3" [ngModel]="country()" (ngModelChange)="country.set($event)" name="country" (change)="autoSave()">
                  <option value="">Anywhere</option>
                  @for (c of countries; track c.code) { <option [value]="c.code">{{ c.name }}</option> }
                </select>
              </div>
            </div>
            <label class="mt-4 flex cursor-pointer items-center justify-between rounded-2xl border border-ink-50/10 bg-ink-50/[0.03] p-4">
              <div>
                <div class="text-sm font-medium">Verified people only</div>
                <div class="text-[11px] text-ink-50/45">Match with age-verified users</div>
              </div>
              <input type="checkbox" class="h-5 w-5 accent-[#7c4dff]" [ngModel]="preferVerified()" (ngModelChange)="preferVerified.set($event)" name="preferVerified" (change)="autoSave()" />
            </label>
          } @else {
            <button routerLink="/premium" class="btn-secondary mt-4 w-full !py-3 text-sm">🔓 Language, country & verified filters</button>
          }

          <!-- consent note when broadening -->
          @if (seekingChanged()) {
            <div class="mt-3 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-[12px] text-amber-100/90">
              Heads up: you changed who you meet. Your new preference applies to future matches only and your previous choice won't be overridden silently.
            </div>
          }
        </section>

        <!-- Geo & age filters (Premium) -->
        @if (premium()) {
        <section class="animate-fade-up glass-card mt-4 p-5" style="animation-delay: 40ms">
          <h2 class="mb-3 font-display text-[15px] font-bold">Geo &amp; age filters</h2>
          <p class="mb-4 text-sm text-ink-50/55">Only match with people nearby and in your age range.</p>
          <label class="flex cursor-pointer items-center justify-between mb-4">
            <div>
              <div class="text-sm font-medium">Show people nearby</div>
              <div class="text-[11px] text-ink-50/45">Uses your last-known location</div>
            </div>
            <input type="checkbox" class="h-5 w-5 accent-[#7c4dff]" [ngModel]="geoEnabled()" (ngModelChange)="geoEnabled.set($event)" name="geoEnabled" (change)="autoSaveGeo()" />
          </label>
          <div class="space-y-3">
            <div>
              <label class="label" for="radius">Search radius</label>
              <input id="radius" type="range" min="1" max="500" step="5" [ngModel]="radiusKm()" (ngModelChange)="radiusKm.set($event as number)" name="radius" (change)="autoSaveGeo()" />
              <div class="flex justify-between text-[11px] text-ink-50/45"><span>{{ radiusKm() }} km</span></div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="label" for="minAge">Min age</label>
                <input id="minAge" type="number" min="18" max="99" class="input !py-3 w-full" [ngModel]="minAge()" (ngModelChange)="minAge.set($event as number)" name="minAge" (change)="autoSaveGeo()" />
              </div>
              <div>
                <label class="label" for="maxAge">Max age</label>
                <input id="maxAge" type="number" min="18" max="99" class="input !py-3 w-full" [ngModel]="maxAge()" (ngModelChange)="maxAge.set($event as number)" name="maxAge" (change)="autoSaveGeo()" />
              </div>
            </div>
          </div>
        </section>
        } @else {
        <section class="animate-fade-up glass-card mt-4 p-5" style="animation-delay: 40ms">
          <h2 class="mb-3 font-display text-[15px] font-bold">Geo &amp; age filters</h2>
          <p class="mb-3 text-sm text-ink-50/55">Unlock location &amp; age filters to find people nearby.</p>
          <button routerLink="/premium" class="btn-secondary w-full !py-3 text-sm">✨ Upgrade to Premium</button>
        </section>
        }

        <!-- Privacy -->
        <section class="animate-fade-up glass-card mt-4 p-5" style="animation-delay: 60ms">
          <h2 class="mb-4 font-display text-[15px] font-bold">Privacy</h2>
          <label class="mb-3 flex cursor-pointer items-center justify-between">
            <div>
              <div class="text-sm font-medium">Show online status</div>
              <div class="text-[11px] text-ink-50/45">Let others see when you're around</div>
            </div>
            <input type="checkbox" class="h-5 w-5 accent-[#7c4dff]" [ngModel]="visibility() !== 'NOBODY'" (change)="toggleOnline($event)" />
          </label>

          <div>
            <span class="label">Who can see you're online</span>
            <div class="grid grid-cols-3 gap-2">
              @for (o of visOptions; track o.v) {
                <button (click)="visibility.set(o.v); autoSave()"
                  class="rounded-xl border px-2 py-2.5 text-[12px] font-medium transition-all active:scale-95"
                  [class]="visibility() === o.v ? 'border-brand-400 bg-brand-500/15' : 'border-ink-50/10 bg-ink-50/[0.03] text-ink-50/55'">
                  {{ o.label }}
                </button>
              }
            </div>
          </div>

          <label class="mt-4 flex cursor-pointer items-center justify-between">
            <div>
              <div class="text-sm font-medium">Message history</div>
              <div class="text-[11px] text-ink-50/45">Keep messages after matches end</div>
            </div>
            <input type="checkbox" class="h-5 w-5 accent-[#7c4dff]" [ngModel]="retentionDays() > 0" (change)="toggleRetention($event)" />
          </label>
        </section>

        <!-- Notifications -->
        <section class="animate-fade-up glass-card mt-4 p-5" style="animation-delay: 100ms">
          <h2 class="mb-3 font-display text-[15px] font-bold">Notifications</h2>
          <label class="mb-3 flex cursor-pointer items-center justify-between">
            <span class="text-sm text-ink-50/75">Friend requests</span>
            <input type="checkbox" class="h-5 w-5 accent-[#7c4dff]" [ngModel]="notifyFriend()" (ngModelChange)="notifyFriend.set($event)" name="notifyFriend" (change)="autoSave()" />
          </label>
          <label class="mb-3 flex cursor-pointer items-center justify-between">
            <span class="text-sm text-ink-50/75">New followers</span>
            <input type="checkbox" class="h-5 w-5 accent-[#7c4dff]" [ngModel]="notifyFollower()" (ngModelChange)="notifyFollower.set($event)" name="notifyFollower" (change)="autoSave()" />
          </label>
          <label class="flex cursor-pointer items-center justify-between">
            <span class="text-sm text-ink-50/75">Offers & updates</span>
            <input type="checkbox" class="h-5 w-5 accent-[#7c4dff]" [ngModel]="notifyPromo()" (ngModelChange)="notifyPromo.set($event)" name="notifyPromo" (change)="autoSave()" />
          </label>
        </section>

        <!-- Blocked -->
        <section class="animate-fade-up glass-card mt-4 p-5" style="animation-delay: 140ms">
          <h2 class="mb-3 font-display text-[15px] font-bold">Blocked users</h2>
          @if (blocked().length === 0) {
            <p class="text-sm text-ink-50/40">No one blocked. Keep it friendly 🤝</p>
          } @else {
            <div class="space-y-2">
              @for (b of blocked(); track b.blockedId) {
                <div class="flex items-center justify-between rounded-2xl bg-ink-50/[0.04] px-4 py-3">
                  <span class="text-sm text-ink-50/70">{{ b.blockedId.slice(0, 8) }}…</span>
                  <button (click)="unblock(b.blockedId)" class="chip hover:bg-ink-50/15 transition-colors">Unblock</button>
                </div>
              }
            </div>
          }
        </section>

        <!-- Account -->
        <section class="animate-fade-up glass-card mt-4 p-5" style="animation-delay: 180ms">
          <h2 class="mb-3 font-display text-[15px] font-bold">Account</h2>
          <button (click)="logout()" class="btn-secondary w-full !py-3 text-sm">Sign out</button>
          <button (click)="deleteAccount()" class="mt-2.5 w-full rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-200 transition-colors hover:bg-red-500/20">
            Delete account & data
          </button>
          <p class="mt-2 text-center text-[11px] text-ink-50/35">
            Your profile, messages and sessions are removed. Match logs are retained for safety compliance.
          </p>
        </section>
      }
    </div>
  `,
})
export class SettingsPage implements OnInit {
  api = inject(ApiService);
  auth = inject(AuthService);
  toast = inject(ToastService);
  router = inject(Router);
  theme = inject(ThemeService);

  loading = signal(true);
  premium = signal(false);
  seeking = signal<SeekingPreference>(SeekingPreference.EVERYONE);
  seekingChanged = signal(false);
  language = signal('');
  country = signal('');
  preferVerified = signal(false);
  geoEnabled = signal(false);
  radiusKm = signal(50);
  minAge = signal(18);
  maxAge = signal(99);
  visibility = signal<OnlineVisibility>(OnlineVisibility.EVERYONE);
  retentionDays = signal(0);
  notifyFriend = signal(true);
  notifyFollower = signal(true);
  notifyPromo = signal(false);
  blocked = signal<{ blockedId: string; createdAt: string }[]>([]);

  seekingOptions = [
    { v: SeekingPreference.EVERYONE, label: 'Everyone' },
    { v: SeekingPreference.WOMEN, label: 'Women' },
    { v: SeekingPreference.MEN, label: 'Men' },
  ];
  visOptions = [
    { v: OnlineVisibility.EVERYONE, label: 'Everyone' },
    { v: OnlineVisibility.FRIENDS, label: 'Friends' },
    { v: OnlineVisibility.NOBODY, label: 'Nobody' },
  ];
  themeOptions: { v: ThemeMode; label: string; icon: string }[] = [
    { v: 'dark', label: 'Dark', icon: '🌙' },
    { v: 'light', label: 'Light', icon: '☀️' },
    { v: 'auto', label: 'Auto', icon: '💻' },
  ];
  langs = ['English', 'Español', 'Français', 'Deutsch', 'Português', 'العربية', 'हिन्दी', '中文'];
  countries = [
    { code: 'US', name: 'United States' }, { code: 'GB', name: 'United Kingdom' },
    { code: 'DE', name: 'Germany' }, { code: 'FR', name: 'France' },
    { code: 'BR', name: 'Brazil' }, { code: 'IN', name: 'India' },
    { code: 'JP', name: 'Japan' }, { code: 'AU', name: 'Australia' },
  ];

  async ngOnInit() {
    try {
      const [me, ent, blk, geo] = await Promise.all([
        this.api.me().toPromise(),
        this.api.entitlements().toPromise(),
        this.api.blockedList().toPromise(),
        this.api.getGeo().toPromise(),
      ]);
      const p = me?.preferences;
      if (p) {
        this.seeking.set(p.seeking as SeekingPreference);
        this.language.set(p.language ?? '');
        this.country.set(p.country ?? '');
        this.preferVerified.set(p.preferVerified);
        this.visibility.set(p.onlineVisibility as OnlineVisibility);
        this.retentionDays.set(p.messageRetentionDays);
      }
      this.premium.set(ent?.tier === 'PREMIUM');
      this.notifyFriend.set(true);
      this.blocked.set(blk ?? []);
      if (geo) {
        this.geoEnabled.set(geo.geoEnabled);
        this.radiusKm.set(geo.radiusKm);
        this.minAge.set(geo.minAge);
        this.maxAge.set(geo.maxAge);
      }
    } catch {
      this.toast.error('Could not load settings');
    } finally {
      this.loading.set(false);
    }
  }

  async autoSave() {
    try {
      await this.api
        .updatePreferences({
          seeking: this.seeking(),
          language: this.language() || undefined,
          country: this.country() || undefined,
          preferVerified: this.preferVerified(),
          onlineVisibility: this.visibility(),
          messageRetentionDays: this.retentionDays(),
        })
        .toPromise();
      this.seekingChanged.set(true);
      this.toast.success('Preferences saved');
    } catch {
      this.toast.error('Save failed');
    }
  }

  async autoSaveGeo() {
    try {
      await this.api
        .updateGeo({
          geoEnabled: this.geoEnabled(),
          radiusKm: this.radiusKm(),
          minAge: this.minAge(),
          maxAge: this.maxAge(),
        })
        .toPromise();
      this.toast.success('Geo filters saved');
    } catch {
      this.toast.error('Save failed');
    }
  }

  async toggleOnline(ev: Event) {
    const on = (ev.target as HTMLInputElement).checked;
    this.visibility.set(on ? OnlineVisibility.EVERYONE : OnlineVisibility.NOBODY);
    await this.autoSave();
  }

  async toggleRetention(ev: Event) {
    const on = (ev.target as HTMLInputElement).checked;
    this.retentionDays.set(on ? 30 : 0);
    await this.autoSave();
  }

  async unblock(id: string) {
    try {
      await this.api.unblock(id).toPromise();
      this.blocked.update((l) => l.filter((b) => b.blockedId !== id));
      this.toast.success('Unblocked');
    } catch {
      this.toast.error('Failed');
    }
  }

  async logout() {
    this.auth.logout();
    await this.router.navigateByUrl('/login');
  }

  async deleteAccount() {
    if (!window.confirm('Delete your account permanently? This cannot be undone.')) return;
    try {
      await this.api.deleteMe().toPromise();
      this.auth.clear();
      this.toast.info('Account deleted. Take care 💜');
      await this.router.navigateByUrl('/');
    } catch {
      this.toast.error('Deletion failed');
    }
  }

  back() {
    window.history.back();
  }
}
