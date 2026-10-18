import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { BadgeDto, KarmaDto, VerificationStatus } from '@bundle/shared';
import { VerificationProvider } from '@bundle/shared';
import { ApiService, type MePayload } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { AvatarComponent } from '../../shared/ui';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [FormsModule, RouterLink, AvatarComponent],
  template: `
    <div class="mx-auto w-full max-w-lg px-5 pt-safe pb-28">
      <header class="animate-fade-up flex items-center justify-between py-4">
        <button class="text-ink-50/60 transition-colors hover:text-ink-50" (click)="back()" aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <h1 class="font-display text-lg font-bold">Your profile</h1>
        <span class="w-5"></span>
      </header>

      @if (loading()) {
        <div class="space-y-4">
          <div class="skeleton h-40"></div>
          <div class="skeleton h-14"></div>
          <div class="skeleton h-32"></div>
        </div>
      } @else {
        <!-- avatar card -->
        <section class="animate-fade-up glass-card p-6 text-center">
          <div class="mx-auto w-fit">
            <app-avatar [name]="me()?.username ?? '?'" [hue]="hue()" [size]="88" [verified]="me()?.isVerified ?? false" />
          </div>
          <div class="mt-3 font-display text-xl font-bold">{{ displayName() || me()?.username }}</div>
          <div class="text-sm text-ink-50/45">&#64;{{ me()?.username }} <span class="mx-1">·</span> {{ ageNote() }}</div>
          @if (me()?.isVerified) {
            <span class="chip mt-3 !border-mint/40 !bg-mint/10 !text-mint">✓ Identity verified</span>
          } @else {
            <span class="chip mt-3 !border-amber-400/30 !bg-amber-400/10 !text-amber-200">Age-assurance pending</span>
          }
          @if (verification()?.badge; as badge) {
            <span class="chip mt-2 !border-brand-400/40 !bg-brand-500/10 !text-brand-200">✓ {{ badge.kind }} verified</span>
          }
          @if (verification()?.status === 'PENDING') {
            <span class="chip mt-2 !border-amber-400/30 !bg-amber-400/10 !text-amber-200">⏳ Verification review in progress</span>
          }
          @if (karma(); as k) {
            <div class="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-400/10 px-3.5 py-1.5">
              <span class="text-base leading-none">⭐</span>
              <span class="text-sm font-semibold">{{ k.score != null ? k.score.toFixed(1) : 'New' }}</span>
              <span class="text-[11px] text-ink-50/50">{{ k.ratings === 0 ? 'no ratings yet' : (k.ratings + ' rating' + (k.ratings === 1 ? '' : 's')) }}</span>
            </div>
          }
        </section>

        <!-- edit -->
        <section class="animate-fade-up glass-card mt-4 space-y-4 p-5" style="animation-delay: 80ms">
          <div>
            <label class="label" for="dn">Display name</label>
            <input id="dn" class="input" [ngModel]="displayName()" (ngModelChange)="displayName.set($event)" name="displayName" maxlength="48" placeholder="How should we show you?" />
          </div>
          <div>
            <label class="label" for="bio">Bio</label>
            <textarea id="bio" class="input min-h-24 resize-none" [ngModel]="bio()" (ngModelChange)="bio.set($event)" name="bio" maxlength="280" placeholder="Interests, vibe, favorite music…"></textarea>
            <div class="mt-1 text-right text-[11px] text-ink-50/35">{{ bio().length }}/280</div>
          </div>

          <div>
            <span class="label">Interest tags <span class="text-ink-50/35">(up to 12)</span></span>
            <div class="flex flex-wrap gap-2">
              @for (t of interests(); track t) {
                <button (click)="removeInterest(t)" class="chip !border-brand-400/40 !bg-brand-500/15 transition-transform hover:scale-105 active:scale-95">
                  {{ t }} <span class="ml-1 text-ink-50/50">×</span>
                </button>
              }
            </div>
            <input class="input mt-2 !py-2.5" placeholder="Type an interest, press Enter" (keydown.enter)="addInterest($event)" maxlength="24" />
          </div>

          <div>
            <label class="label" for="ah">Avatar color</label>
            <div class="flex gap-2">
              @for (h of hues; track h) {
                <button (click)="hue.set(h)" class="h-9 w-9 rounded-full transition-transform hover:scale-110"
                  [style.background]="'conic-gradient(from 140deg, hsl(' + h + ' 70% 45%), hsl(' + ((h + 60) % 360) + ' 75% 55%))'"
                  [class]="hue() === h ? 'ring-2 ring-white ring-offset-2 ring-offset-ink-900' : ''"
                  [attr.aria-label]="'Avatar color ' + h"></button>
              }
            </div>
          </div>

          <button class="btn-primary w-full" (click)="save()" [disabled]="saving()">
            @if (saving()) { Saving… } @else { Save profile }
          </button>
        </section>

        <!-- links -->
        <section class="animate-fade-up mt-4 space-y-2.5" style="animation-delay: 140ms">
          <div class="glass-card flex items-center justify-between p-4">
            <span class="text-sm text-ink-50/70">Member since</span>
            <span class="text-sm text-ink-50/45">{{ memberSince() }}</span>
          </div>
          <a routerLink="/settings" class="glass-card flex items-center justify-between p-4 transition-colors hover:bg-ink-50/[0.07]">
            <span class="text-sm text-ink-50/70">Settings & privacy</span>
            <span class="text-ink-50/30">→</span>
          </a>
        </section>

        <!-- verification -->
        @if (!me()?.isVerified) {
        <section class="animate-fade-up glass-card mt-4 p-5" style="animation-delay: 140ms">
          <h2 class="mb-3 font-display text-[15px] font-bold">Verify your identity</h2>
          <p class="mb-4 text-sm text-ink-50/55">Get a verified badge so others can trust you're a real adult.</p>
          @if (verification()?.status !== 'PENDING') {
            <div class="space-y-3">
              <div>
                <label class="label block text-sm mb-1.5">Photo selfie</label>
                <input type="file" accept="image/*" (change)="onSelfieFile($event)" [disabled]="submitting()" />
              </div>
              <div>
                <label class="label block text-sm mb-1.5">ID document</label>
                <input type="file" accept="image/*" (change)="onIdFile($event)" [disabled]="submitting()" />
              </div>
              <button (click)="submitVerification()" [disabled]="submitting() || !selfieDataUrl() && !idDataUrl()" class="btn-primary w-full">
                @if (submitting()) { Submitting… } @else { Submit for review }
              </button>
            </div>
          } @else {
            <p class="text-sm text-ink-50/45">Your verification is under review. We'll notify you when it's decided.</p>
          }
          @if (verificationError()) {
            <p class="mt-3 text-[11px] text-red-300">{{ verificationError() }}</p>
          }
        </section>
        }
      }
    </div>
  `,
})
export class ProfilePage implements OnInit {
  api = inject(ApiService);
  toast = inject(ToastService);

  me = signal<MePayload | null>(null);
  loading = signal(true);
  saving = signal(false);
  submitting = signal(false);
  verification = signal<{ status: VerificationStatus | null; badge: BadgeDto | null } | null>(null);
  verificationError = signal('');
  selfieDataUrl = signal<string | null>(null);
  idDataUrl = signal<string | null>(null);
  displayName = signal('');
  bio = signal('');
  hue = signal(210);
  interests = signal<string[]>([]);
  karma = signal<KarmaDto | null>(null);

  hues = [210, 265, 320, 0, 30, 60, 140, 185];

  ageNote() {
    const u = this.me();
    if (!u?.profile?.gender) return '18+';
    const g: Record<string, string> = { MALE: 'Man', FEMALE: 'Woman', NONBINARY: 'Non-binary', OTHER: 'Other', PREFER_NOT_SAY: '18+' };
    return g[u.profile.gender] ?? '18+';
  }

  memberSince() {
    const c = this.me()?.createdAt;
    return c ? new Date(c).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '—';
  }

  addInterest(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const v = input.value.trim();
    if (!v) return;
    if (this.interests().length >= 12) {
      this.toast.info('Max 12 interests');
      return;
    }
    this.interests.update((l) => (l.includes(v) ? l : [...l, v]));
    input.value = '';
  }

  removeInterest(t: string) {
    this.interests.update((l) => l.filter((x) => x !== t));
  }

  back() {
    window.history.back();
  }

  async ngOnInit() {
    try {
      const [me, karma, ver] = await Promise.all([
        this.api.me().toPromise(),
        this.api.myKarma().toPromise().catch(() => null),
        this.api.myVerification().toPromise().catch(() => null),
      ]);
      this.me.set(me ?? null);
      this.displayName.set(me?.profile?.displayName ?? '');
      this.bio.set(me?.profile?.bio ?? '');
      this.hue.set(me?.profile?.avatarHue ?? 210);
      this.interests.set(me?.profile?.interests ?? []);
      this.karma.set(karma ?? null);
      this.verification.set(ver ? { status: ver.status as VerificationStatus | null, badge: ver.badge ?? null } : null);
    } catch {
      this.toast.error('Could not load profile');
    } finally {
      this.loading.set(false);
    }
  }

  async save() {
    this.saving.set(true);
    try {
      await this.api
        .updateProfile({
          displayName: this.displayName().trim(),
          bio: this.bio().trim(),
          avatarHue: this.hue(),
          interests: this.interests(),
        })
        .toPromise();
      this.toast.success('Profile saved ✨');
    } catch {
      this.toast.error('Save failed — try again');
    } finally {
      this.saving.set(false);
    }
  }

  onSelfieFile(ev: Event) {
    const file = (ev.target as HTMLInputElement)?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => this.selfieDataUrl.set(reader.result as string);
    reader.readAsDataURL(file);
  }

  onIdFile(ev: Event) {
    const file = (ev.target as HTMLInputElement)?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => this.idDataUrl.set(reader.result as string);
    reader.readAsDataURL(file);
  }

  async submitVerification() {
    this.submitting.set(true);
    this.verificationError.set('');
    try {
      const hasSelfie = !!this.selfieDataUrl();
      const hasId = !!this.idDataUrl();
      if (!hasSelfie && !hasId) {
        this.verificationError.set('Please select at least one file');
        return;
      }
      const provider = hasSelfie && hasId ? VerificationProvider.ID_DOCUMENT : (hasSelfie ? VerificationProvider.SELFIE : VerificationProvider.ID_DOCUMENT);
      await this.api
        .submitVerification(provider, hasSelfie ? this.selfieDataUrl() ?? undefined : undefined, hasId ? this.idDataUrl() ?? undefined : undefined)
        .toPromise();
      this.toast.success('Submitted for review');
      this.selfieDataUrl.set(null);
      this.idDataUrl.set(null);
      await this.ngOnInit();
    } catch {
      this.verificationError.set('Submission failed — try again');
    } finally {
      this.submitting.set(false);
    }
  }
}
