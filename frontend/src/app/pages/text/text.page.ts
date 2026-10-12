import { Component, ElementRef, NgZone, OnDestroy, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RealtimeService, type IncomingChat } from '../../core/realtime.service';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { AvatarComponent, RatingSheetComponent } from '../../shared/ui';

const EMOJIS = ['👋', '😄', '❤️', '🔥', '😂', '🎉', '👀', '🤝', '😎', '✨'];

@Component({
  selector: 'app-text-page',
  standalone: true,
  imports: [FormsModule, AvatarComponent, RatingSheetComponent],
  template: `
    <div class="mx-auto flex h-dvh w-full max-w-lg flex-col">
      <!-- header -->
      <header class="flex items-center justify-between border-b border-ink-50/10 bg-ink-900/80 px-4 pt-safe pb-3 backdrop-blur-xl">
        <button class="flex items-center gap-2 text-ink-50/60 transition-colors hover:text-ink-50" (click)="end()" aria-label="Leave chat">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>

        @if (matched()) {
          <div class="flex items-center gap-2.5">
            <app-avatar [name]="peerName()" [hue]="peerHue()" [size]="34" />
            <div>
              <div class="font-display text-[13px] font-bold leading-tight">{{ peerName() }}</div>
              <div class="text-[10px] text-ink-50/45">{{ peerTyping() ? 'typing…' : 'random match' }}</div>
            </div>
          </div>
        } @else {
          <div class="font-display text-sm font-bold">Buddy text chat</div>
        }

        <div class="flex items-center gap-2">
          @if (matched()) {
            <button (click)="blockPopup()" class="grid h-9 w-9 place-items-center rounded-full text-ink-50/50 transition-colors hover:bg-red-500/20 hover:text-red-300" aria-label="Block user" title="Block">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
            </button>
            <button (click)="reportPopup()" class="grid h-9 w-9 place-items-center rounded-full text-ink-50/50 transition-colors hover:bg-ink-50/10 hover:text-ink-50" aria-label="Report user" title="Report">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15V4h13l-2 5 2 5H6"/></svg>
            </button>
            <button (click)="skip()" class="grid h-9 w-9 place-items-center rounded-full text-ink-50/50 transition-colors hover:bg-ink-50/10 hover:text-ink-50" aria-label="Skip to next person" title="Next">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l10 8-10 8V4zM18 4h2.5v16H18z"/></svg>
            </button>
          }
        </div>
      </header>

      <!-- SEARCHING -->
      @if (phase() === 'waiting') {
        <div class="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div class="relative mb-6">
            <div class="absolute -inset-3 animate-pulse-ring rounded-full bg-brand-500/40"></div>
            <div class="grid h-20 w-20 animate-pulse place-items-center rounded-full bg-gradient-to-br from-brand-500 to-fuchsia-500 text-3xl">💬</div>
          </div>
          <h2 class="animate-fade-up font-display text-lg font-bold">Looking for someone to talk to…</h2>
          <p class="mt-2 animate-fade-up text-sm text-ink-50/50" style="animation-delay: 100ms">{{ waitNudge() }}</p>
          <button class="btn-secondary mt-7" (click)="end()">Cancel</button>
        </div>
      }

      <!-- MESSAGE LIST -->
      @if (phase() === 'matched' || phase() === 'in-call' || phase() === 'reconnecting') {
        @if (phase() === 'reconnecting') {
          <div class="mx-4 mt-3 animate-pop-in rounded-xl bg-amber-400/15 px-3 py-2 text-center text-xs font-semibold text-amber-300">
            Connection lost — reconnecting…
          </div>
        } @else if (peerReconnecting()) {
          <div class="mx-4 mt-3 animate-pop-in rounded-xl bg-amber-400/15 px-3 py-2 text-center text-xs font-semibold text-amber-300">
            Their connection dropped — waiting up to 20s…
          </div>
        }
        <div #msgList class="flex-1 space-y-2.5 overflow-y-auto px-4 py-4">
          @if (msgs().length === 0) {
            <div class="grid h-full place-items-center text-center">
              <div>
                <div class="mb-3 text-4xl animate-float">🎯</div>
                <p class="text-sm text-ink-50/50">You're matched with <strong class="text-ink-50">{{ peerName() }}</strong>!<br />Say hello 👋</p>
                @if (sharedInterests().length) {
                  <div class="mt-2 flex flex-wrap justify-center gap-1">
                    @for (t of sharedInterests().slice(0, 4); track t) {
                      <span class="rounded-full bg-brand-500/25 px-2.5 py-0.5 text-[11px] font-medium text-brand-100">❤ {{ t }}</span>
                    }
                  </div>
                }
                <div class="mt-4 flex flex-wrap justify-center gap-2">
                  @for (e of quickEmojis; track e) {
                    <button (click)="sendEmoji(e)" class="animate-pop-in chip hover:scale-110 transition-transform !text-xl !py-2 !px-3">{{ e }}</button>
                  }
                </div>
              </div>
            </div>
          }
          @for (m of msgs(); track m.id) {
            <div class="flex" [class.justify-end]="m.fromUserId === myId()" [class.justify-start]="m.fromUserId !== myId()">
              <div
                class="max-w-[78%] animate-bubble-in rounded-2xl px-4 py-2.5 text-[14px] leading-snug shadow-md"
                [class]="m.kind === 'emoji'
                  ? 'bg-transparent !shadow-none px-0 text-4xl'
                  : m.fromUserId === myId()
                    ? 'rounded-br-md bg-gradient-to-br from-brand-600 to-brand-500 text-white'
                    : 'rounded-bl-md bg-ink-50/[0.09] text-ink-50'"
              >
                {{ m.text }} @if (m.kind !== 'emoji' && m.fromUserId !== myId()) { <span class="sr-only">(received)</span> }
              </div>
            </div>
          }
          @if (peerTyping()) {
            <div class="flex justify-start">
              <div class="flex gap-1 rounded-2xl bg-ink-50/[0.09] px-4 py-3">
                <span class="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-50/60" style="animation-delay: 0ms"></span>
                <span class="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-50/60" style="animation-delay: 150ms"></span>
                <span class="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-50/60" style="animation-delay: 300ms"></span>
              </div>
            </div>
          }
        </div>
      }

      <!-- PEER LEFT -->
      @if (phase() === 'peer-left' || phase() === 'error') {
        <div class="grid flex-1 place-items-center px-6 text-center">
          <div class="animate-pop-in glass-card w-full max-w-xs p-6">
            <div class="mb-3 text-4xl">{{ phase() === 'peer-left' ? '👋' : '📡' }}</div>
            <h2 class="font-display text-lg font-bold">{{ phase() === 'peer-left' ? 'They left' : 'Connection hiccup' }}</h2>
            <div class="mt-5 space-y-2.5">
              <button class="btn-primary w-full" (click)="skip()">New match →</button>
              <button class="btn-secondary w-full" (click)="end()">Home</button>
            </div>
          </div>
        </div>
      }

      <!-- COMPOSER -->
      @if (phase() === 'matched' || phase() === 'in-call' || phase() === 'reconnecting') {
        <div class="border-t border-ink-50/10 bg-ink-900/80 px-3 pt-2 pb-safe backdrop-blur-xl">
          <!-- emoji row -->
          <div class="mb-2 flex gap-1.5 overflow-x-auto pb-1">
            @for (e of quickEmojis; track e) {
              <button (click)="sendEmoji(e)" class="shrink-0 grid h-9 w-9 place-items-center rounded-xl bg-ink-50/[0.05] text-lg transition-transform hover:scale-110 active:scale-90">{{ e }}</button>
            }
          </div>
          <form (ngSubmit)="send()" class="flex items-end gap-2">
            <input
              class="input flex-1 !rounded-2xl !py-3" [ngModel]="draft()" (ngModelChange)="draft.set($event); onTyping()" name="draft" placeholder="Type a message…" maxlength="1000"
              autocomplete="off"
            />
            <button type="submit" class="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-400 text-ink-50 shadow-lg shadow-brand-600/30 transition-transform active:scale-90" aria-label="Send">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            </button>
          </form>
        </div>
      }

      @if (showRating()) {
        <app-rating-sheet
          [matchId]="lastMatchId()"
          [peerName]="lastPeerName()"
          (dismiss)="closeRating()"
          (rated)="onRated()"
        />
      }
    </div>
  `,
})
export class TextPage implements OnInit, OnDestroy {
  rt = inject(RealtimeService);
  auth = inject(AuthService);
  toast = inject(ToastService);
  router = inject(Router);
  zone = inject(NgZone);

  msgList = viewChild<ElementRef<HTMLDivElement>>('msgList');

  phase = this.rt.phase;
  peerReconnecting = this.rt.peerReconnecting;
  match = this.rt.matchInfo;
  msgs = signal<IncomingChat[]>([]);
  peerName = computed(() => this.match()?.peer?.displayName || this.match()?.peer?.username || 'New friend');
  peerHue = computed(() => this.match()?.peer?.avatarHue ?? 210);
  peerVerified = computed(() => !!this.match()?.peer?.isVerified);
  sharedInterests = computed(() => this.match()?.sharedInterests ?? []);
  peerTyping = signal(false);
  matched = signal(false);
  myId = signal('');
  draft = signal('');
  quickEmojis = EMOJIS;

  showRating = signal(false);
  lastMatchId = signal('');
  lastPeerName = signal('');
  private ratedMatchIds = new Set<string>();

  constructor() {
    effect(() => {
      const m = this.match();
      if (m) {
        this.lastMatchId.set(m.matchId);
        this.lastPeerName.set(m.peer?.displayName || m.peer?.username || 'your chat partner');
      }
      if (this.phase() === 'peer-left' && m && !this.ratedMatchIds.has(m.matchId)) {
        this.showRating.set(true);
      }
    });
  }

  closeRating() {
    if (this.lastMatchId()) this.ratedMatchIds.add(this.lastMatchId());
    this.showRating.set(false);
  }

  onRated() {
    if (this.lastMatchId()) this.ratedMatchIds.add(this.lastMatchId());
    this.showRating.set(false);
    this.toast.success('Thanks for the feedback 💜');
  }

  private typingHideTimer: ReturnType<typeof setTimeout> | null = null;
  private typingStopTimer: ReturnType<typeof setTimeout> | null = null;
  private waitTick: ReturnType<typeof setInterval> | null = null;
  private waited = 0;
  private lastTypingSent = 0;
  private onChatMessage = (msg: IncomingChat) =>
    this.zone.run(() => {
      this.msgs.update((l) => [...l.slice(-120), msg]);
      this.scrollBottom();
    });
  private onChatTyping = (p: { typing: boolean }) =>
    this.zone.run(() => {
      this.peerTyping.set(p.typing);
      if (p.typing) {
        if (this.typingHideTimer) clearTimeout(this.typingHideTimer);
        this.typingHideTimer = setTimeout(() => this.peerTyping.set(false), 3500);
      }
    });

  waitNudge() {
    return this.waited < 8 ? 'Scanning the room…' : this.waited < 25 ? 'Still looking — bigger pond, more chance…' : 'Fewer folks right now — you will get first pick.';
  }

  async ngOnInit() {
    this.myId.set(this.auth.user()?.id ?? '');
    try {
      await this.rt.connect(this.auth.access() ?? '');
    } catch {
      this.toast.error('Could not connect.');
    }
    this.rt.on('chat:message', this.onChatMessage);
    this.rt.on('chat:typing', this.onChatTyping);
    // Derive header state from the shared phase signal (survives reconnects).
    this.matched.set(this.phase() === 'matched' || this.phase() === 'in-call');
    // start immediately
    this.phase.set('waiting');
    this.startWait();
    const res = await this.rt.joinQueue('TEXT');
    if (!res.ok) {
      this.toast.error(res.error ?? 'Queue unavailable');
      this.phase.set('error');
    }
  }

  startWait() {
    this.waited = 0;
    this.waitTick = setInterval(() => this.waited++, 1000);
  }

  scrollBottom() {
    const el = this.msgList()?.nativeElement;
    if (el) requestAnimationFrame(() => (el.scrollTop = el.scrollHeight));
  }

  async send() {
    const text = this.draft().trim();
    if (!text) return;
    this.draft.set('');
    const r = await this.rt.sendMessage(text, 'text');
    if (!r.ok) this.toast.error(r.error ?? 'Message failed — slow down a bit');
  }

  async sendEmoji(e: string) {
    const r = await this.rt.sendMessage(e, 'emoji');
    if (!r.ok) this.toast.error(r.error ?? 'Message failed');
  }

  onTyping() {
    // Throttle: at most one typing=true per 2s; stop is debounced below.
    const now = Date.now();
    if (now - this.lastTypingSent > 2000) {
      this.lastTypingSent = now;
      this.rt.sendTyping(true);
    }
    if (this.typingStopTimer) clearTimeout(this.typingStopTimer);
    this.typingStopTimer = setTimeout(() => this.rt.sendTyping(false), 1500);
  }

  async skip() {
    if (this.waitTick) clearInterval(this.waitTick);
    await this.rt.skip();
    this.msgs.set([]);
    this.peerTyping.set(false);
    this.matched.set(false);
    this.phase.set('waiting');
    this.startWait();
    const res = await this.rt.joinQueue('TEXT');
    if (!res.ok) {
      this.toast.error(res.error ?? 'Queue unavailable');
      this.phase.set('error');
    }
  }

  async reportPopup() {
    const peerId = this.match()?.peer?.userId;
    if (!peerId) return;
    const r = await this.rt.reportPeer(peerId, 'OTHER', 'reported from text chat');
    if (r.ok) {
      this.toast.success('Report sent — thank you. You can block or skip anytime.');
    } else {
      this.toast.error('Report failed — try again.');
    }
  }

  async blockPopup() {
    const peerId = this.match()?.peer?.userId;
    if (!peerId) return;
    const r = await this.rt.blockPeer(peerId);
    if (r.ok) {
      this.toast.info('User blocked');
      await this.skip();
    } else {
      this.toast.error('Could not block user');
    }
  }

  async end() {
    if (this.waitTick) clearInterval(this.waitTick);
    await this.rt.leaveQueue();
    await this.router.navigateByUrl('/home');
  }

  ngOnDestroy() {
    if (this.waitTick) clearInterval(this.waitTick);
    if (this.typingHideTimer) clearTimeout(this.typingHideTimer);
    if (this.typingStopTimer) clearTimeout(this.typingStopTimer);
    this.rt.off('chat:message', this.onChatMessage);
    this.rt.off('chat:typing', this.onChatTyping);
    void this.rt.leaveQueue();
  }
}
