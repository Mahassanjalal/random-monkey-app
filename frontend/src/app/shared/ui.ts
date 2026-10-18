import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { ToastService } from '../core/toast.service';
import { ApiService } from '../core/api.service';

@Component({
  selector: 'app-avatar',
  standalone: true,
  template: `
    <div
      class="grid place-items-center rounded-full font-display font-semibold text-ink-50 shadow-inner"
      [style.width.px]="size"
      [style.height.px]="size"
      [style.font-size.px]="size / 2.6"
      [style.background]="bg()"
      [class.ring-2]="verified"
      [class.ring-accent-mint]="verified"
    >
      {{ initial }}
      @if (verified) {
        <span class="sr-only">verified</span>
      }
    </div>
  `,
})
export class AvatarComponent {
  @Input({ required: true }) name = '?';
  @Input() size = 44;
  @Input() hue = 210;
  @Input() verified = false;

  initial = this.name?.[0]?.toUpperCase() ?? '?';
  bg = computed(() => `conic-gradient(from 140deg, hsl(${this.hue} 70% 45%), hsl(${(this.hue + 60) % 360} 75% 55%))`);

  ngOnChanges() {
    this.initial = (this.name ?? '?').trim()[0]?.toUpperCase() ?? '?';
  }
}

@Component({
  selector: 'app-toasts',
  standalone: true,
  template: `
    <div class="pointer-events-none fixed inset-x-3 top-3 z-[100] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-5 sm:top-5 sm:items-end">
      @for (t of toasts(); track t.id) {
        <div
          class="pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-2xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-xl animate-pop-in"
          [class]="{
            'border-mint/30 bg-mint/10 text-ink-50': t.kind === 'success',
            'border-red-400/30 bg-red-500/10 text-ink-50': t.kind === 'error',
            'border-ink-50/15 bg-ink-800/90 text-ink-50/90': t.kind === 'info'
          }"
          role="status"
          (click)="dismiss(t.id)"
        >
          <div class="flex items-start gap-3">
            <span class="mt-0.5 text-base leading-none">{{ t.kind === 'success' ? '✅' : t.kind === 'error' ? '⚠️' : 'ℹ️' }}</span>
            <span class="flex-1">{{ t.message }}</span>
          </div>
          <span
            class="toast-progress animate-toast-progress absolute inset-x-0 bottom-0 h-[2px]"
            [style.animation-duration.ms]="t.durationMs"
            [class]="{
              'bg-mint/70': t.kind === 'success',
              'bg-red-400/80': t.kind === 'error',
              'bg-brand-400/70': t.kind === 'info'
            }"
          ></span>
        </div>
      }
    </div>
  `,
})
export class ToastsComponent {
  constructor(private toastSvc: ToastService) {}
  toasts = computed(() => this.toastSvc.toasts());
  dismiss(id: number) {
    this.toastSvc.dismiss(id);
  }
}

@Component({
  selector: 'app-skeleton-page',
  standalone: true,
  template: `
    <div class="mx-auto w-full max-w-2xl space-y-4 p-6">
      <div class="skeleton h-24 w-2/3"></div>
      <div class="skeleton h-12"></div>
      <div class="skeleton h-12 w-5/6"></div>
      <div class="skeleton h-36"></div>
    </div>
  `,
})
export class SkeletonPageComponent {}

@Component({
  selector: 'app-rating-sheet',
  standalone: true,
  template: `
    <div class="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 px-4 pb-6 backdrop-blur-sm animate-fade-up sm:items-center">
      <div class="glass-card w-full max-w-sm p-6 text-center">
        <div class="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-fuchsia-500 text-2xl">
          ⭐
        </div>
        <h3 class="font-display text-lg font-bold">How was chatting with {{ peerName }}?</h3>
        <p class="mt-1 text-sm text-ink-50/55">Your rating is anonymous and helps keep Buddy kind.</p>

        <div class="mt-5 flex items-center justify-center gap-2">
          @for (s of [1, 2, 3, 4, 5]; track s) {
            <button
              (click)="submit(s)"
              [disabled]="busy()"
              class="text-3xl transition-transform duration-150 hover:scale-125 active:scale-95 disabled:opacity-50"
              [class]="(s <= hoverScore() ? '' : 'grayscale opacity-40') + (flashScore() === s ? ' animate-star-select' : ' animate-star-pop')"
              [style.animation-delay.ms]="flashScore() === s ? 0 : (s - 1) * 70"
              (mouseenter)="hoverScore.set(s)"
              (mouseleave)="hoverScore.set(score() ?? 0)"
              [attr.aria-label]="s + ' stars'">
              {{ s <= (hoverScore()) ? '⭐' : '☆' }}
            </button>
          }
        </div>
        <div class="mt-1 h-4 text-[11px] font-medium text-ink-50/50">{{ hoverLabel() }}</div>

        <button (click)="dismiss.emit()" class="mt-4 text-[12px] text-ink-50/45 transition-colors hover:text-ink-50/70">
          Skip
        </button>
      </div>
    </div>
  `,
})
export class RatingSheetComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  @Input({ required: true }) matchId = '';
  @Input({ required: true }) peerName = 'your chat partner';
  @Output() dismiss = new EventEmitter<void>();
  @Output() rated = new EventEmitter<number>();

  busy = signal(false);
  score = signal<number | null>(null);
  hoverScore = signal(0);
  flashScore = signal(0);

  hoverLabel = computed(() => {
    switch (this.hoverScore()) {
      case 5:
        return 'Amazing 🙌';
      case 4:
        return 'Great chat';
      case 3:
        return 'It was okay';
      case 2:
        return 'Not great';
      case 1:
        return 'Bad experience';
      default:
        return '';
    }
  });

  async submit(score: number) {
    if (this.busy()) return;
    this.busy.set(true);
    this.score.set(score);
    this.flashScore.set(score);
    try {
      await this.api.rateMatch(this.matchId, score).toPromise();
      this.rated.emit(score);
    } catch {
      this.toast.error('Could not save your rating');
    } finally {
      this.busy.set(false);
    }
  }
}

@Component({
  selector: 'app-searching-radar',
  standalone: true,
  template: `
    <div class="relative grid place-items-center" [style.width.px]="size" [style.height.px]="size">
      @for (r of rings; track r.i) {
        <span
          class="absolute rounded-full border-2 animate-radar-ring"
          [style.inset.px]="r.inset"
          [style.animation-delay.ms]="r.delay"
          [style.border-color]="r.color"></span>
      }
      <span class="radar-sweep animate-radar-sweep absolute rounded-full" style="inset:0"></span>
      <span
        class="grid place-items-center rounded-full bg-gradient-to-br from-brand-500 to-fuchsia-500 text-white shadow-lg shadow-brand-500/40"
        [style.width.px]="core" [style.height.px]="core">
        <span class="text-lg leading-none">{{ emoji }}</span>
      </span>
    </div>
  `,
})
export class SearchingRadarComponent {
  @Input() size = 168;
  @Input() core = 64;
  @Input() emoji = '🔍';

  rings = [
    { i: 0, inset: 0, delay: 0, color: 'rgba(155, 123, 255, 0.55)' },
    { i: 1, inset: 8, delay: 730, color: 'rgba(155, 123, 255, 0.4)' },
    { i: 2, inset: 16, delay: 1460, color: 'rgba(244, 114, 182, 0.4)' },
  ];
}

@Component({
  selector: 'app-match-celebration',
  standalone: true,
  template: `
    @if (active()) {
      <div class="pointer-events-none absolute inset-0 z-30 overflow-hidden" aria-hidden="true">
        <span class="absolute inset-0 grid place-items-center">
          <span class="absolute rounded-full border-2 border-mint/60 animate-pulse-ring" style="inset: 16%"></span>
          <span class="absolute rounded-full border-2 border-brand-400/50 animate-pulse-ring" style="inset: 16%; animation-delay: 220ms"></span>
        </span>
        @for (p of pieces; track p.id) {
          <span
            class="confetti animate-float-up"
            [style.left.%]="p.x"
            [style.bottom.%]="p.y"
            [style.width.px]="p.s"
            [style.height.px]="p.s"
            [style.background]="p.c"
            [style.animation-delay.ms]="p.d"
            [style.animation-duration.ms]="p.t"></span>
        }
      </div>
    }
  `,
})
export class MatchCelebrationComponent {
  @Input() set burst(v: boolean) {
    if (v) {
      this.active.set(true);
      if (this.t) clearTimeout(this.t);
      this.t = setTimeout(() => this.active.set(false), 1500);
    } else {
      this.active.set(false);
    }
  }
  active = signal(false);
  private t: ReturnType<typeof setTimeout> | null = null;

  private palette = ['#9b7bff', '#3ddc97', '#ff6b6b', '#ffb340', '#f472b6', '#ffffff'];
  pieces = Array.from({ length: 18 }, (_, i) => {
    const r = (k: number) => {
      const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    return {
      id: i,
      x: +(r(1) * 96 + 2).toFixed(1),
      y: +(r(2) * 20).toFixed(1),
      s: 5 + Math.floor(r(3) * 6),
      c: this.palette[i % this.palette.length],
      d: Math.floor(r(4) * 320),
      t: 1200 + Math.floor(r(5) * 700),
    };
  });
}

@Component({
  selector: 'app-animated-outlet',
  standalone: true,
  imports: [RouterOutlet],
  template: `<div [class.animate-route-in]="routeAnim()"><router-outlet /></div>`,
})
export class AnimatedOutletComponent {
  private router = inject(Router);
  routeAnim = signal(true);

  constructor() {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      this.routeAnim.set(false);
      setTimeout(() => this.routeAnim.set(true), 30);
    });
  }
}
