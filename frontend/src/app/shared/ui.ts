import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
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
          class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-xl animate-pop-in"
          [class]="{
            'border-mint/30 bg-mint/10 text-ink-50': t.kind === 'success',
            'border-red-400/30 bg-red-500/10 text-ink-50': t.kind === 'error',
            'border-ink-50/15 bg-ink-800/90 text-ink-50/90': t.kind === 'info'
          }"
          role="status"
          (click)="dismiss(t.id)"
        >
          <span class="mt-0.5 text-base leading-none">{{ t.kind === 'success' ? '✅' : t.kind === 'error' ? '⚠️' : 'ℹ️' }}</span>
          <span class="flex-1">{{ t.message }}</span>
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
              class="text-3xl transition-transform hover:scale-125 active:scale-95 disabled:opacity-50"
              [class]="s <= hoverScore() ? '' : 'grayscale opacity-40'"
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
