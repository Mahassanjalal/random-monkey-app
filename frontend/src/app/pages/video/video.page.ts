import { Component, ElementRef, NgZone, OnDestroy, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RealtimeService, type IncomingChat } from '../../core/realtime.service';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { AvatarComponent, RatingSheetComponent, SearchingRadarComponent, MatchCelebrationComponent } from '../../shared/ui';

@Component({
  selector: 'app-video-page',
  standalone: true,
  imports: [FormsModule, AvatarComponent, RatingSheetComponent, SearchingRadarComponent, MatchCelebrationComponent],
  template: `
    <div class="relative mx-auto h-dvh w-full max-w-lg overflow-hidden bg-black">
      <app-match-celebration [burst]="celebrating()" />
      <!-- REMOTE VIDEO -->
      <video
        #remoteVideo
        class="absolute inset-0 h-full w-full object-cover"
        [class.opacity-0]="!remoteReady()"
        [attr.autoplay]="true"
        [attr.playsInline]="true"
      ></video>

      <!-- permission / preview stage (before call) -->
      @if (phase() === 'idle' || phase() === 'connecting') {
        <div class="absolute inset-0 flex flex-col items-center justify-center bg-ink-950/95 px-6 text-center">
          @if (permError()) {
            <div class="animate-pop-in glass-card max-w-sm p-6">
              <div class="mb-3 text-4xl">📷</div>
              <h2 class="font-display text-lg font-bold">Camera & mic needed</h2>
              <p class="mt-2 text-sm leading-relaxed text-ink-50/60">{{ permError() }}</p>
              <div class="mt-5 space-y-2.5">
                <button class="btn-primary w-full" (click)="requestMedia()">Try again</button>
                <button class="btn-secondary w-full" (click)="end()">Go back</button>
              </div>
            </div>
          } @else {
            <div class="relative">
              <div class="absolute inset-0 animate-pulse-ring rounded-full bg-mint/30"></div>
              <video #previewVideo autoplay playsinline muted
                class="h-64 w-auto max-w-[80vw] rounded-3xl object-cover shadow-2xl ring-1 ring-ink-50/15"></video>
            </div>
            <p class="mt-6 animate-fade-up text-sm text-ink-50/55">Your camera is ready.</p>
            <button class="btn-primary mt-4 !px-10 !py-4 text-base" (click)="findPeer()" [disabled]="busy()">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
              Find someone →
            </button>
          }
        </div>
      }

      <!-- SEARCHING stage -->
      @if (phase() === 'waiting') {
        <div class="absolute inset-0 flex flex-col items-center justify-center bg-ink-900/98 px-6 text-center">
          <div class="mb-6">
            <app-searching-radar [size]="180" [core]="64" [emoji]="'🔍'"></app-searching-radar>
          </div>
          <h2 class="animate-fade-up font-display text-xl font-bold">Finding someone…</h2>
          <p class="mt-2 animate-fade-up text-sm text-ink-50/50" style="animation-delay: 100ms">
            {{ waitedSec() < 8 ? 'Scanning the room…' : waitedSec() < 20 ? 'Still looking — hang tight…' : 'Queue is busy, you will be first in line' }}
          </p>
          <button class="btn-secondary mt-8" (click)="end()">Cancel</button>
        </div>
      }

      <!-- MATCHED / IN-CALL / RECONNECTING -->
      @if (phase() === 'matched' || phase() === 'in-call' || phase() === 'reconnecting') {
        <!-- PiP local preview -->
        <div class="absolute right-4 top-4 z-20 animate-slide-in-right">
          <video #pipVideo autoplay playsinline muted
            class="h-28 w-20 rounded-2xl border border-ink-50/20 object-cover shadow-2xl sm:h-36 sm:w-24"></video>
        </div>

        <!-- peer info -->
        <div class="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/70 to-transparent px-5 pt-safe pb-8">
          <div class="mx-auto flex max-w-lg items-center justify-between pt-3">
            <div class="flex items-center gap-3">
              <app-avatar [name]="peerName()" [hue]="peerHue()" [size]="40" [verified]="peerVerified()" />
              <div>
                <div class="font-display text-sm font-bold">{{ peerName() }}</div>
                @if (peerBadges().length) {
                  <div class="mt-0.5 flex flex-wrap gap-1">
                    @for (b of peerBadges(); track b.kind) {
                      <span class="rounded-full bg-brand-500/25 px-2 py-0.5 text-[10px] font-medium text-brand-100">✓ {{ b.kind }}</span>
                    }
                  </div>
                }
                <div class="flex items-center gap-1.5 text-[11px]" [class]="connectedLabel()==='connected' ? 'text-mint' : 'text-amber-300'">
                  <span class="h-1.5 w-1.5 rounded-full" [class]="connectedLabel()==='connected' ? 'bg-mint animate-pulse' : 'bg-amber-300 animate-ping'"></span>
                  {{ connectedLabel() === 'connected' ? 'Connected' : 'Connecting…' }}
                </div>
                @if (sharedInterests().length) {
                  <div class="mt-1 flex flex-wrap gap-1">
                    @for (t of sharedInterests().slice(0, 3); track t) {
                      <span class="rounded-full bg-brand-500/25 px-2 py-0.5 text-[10px] font-medium text-brand-100">❤ {{ t }}</span>
                    }
                  </div>
                }
                @if (peerDistance() !== null) {
                  <div class="mt-1 text-[10px] text-ink-50/45">{{ peerDistance()!.toFixed(0) }} km away</div>
                }
              </div>
            </div>
            <span class="chip">{{ waitLabel() }}</span>
          </div>
        </div>

        <!-- mid-call banner: our socket dropped, or peer state degraded -->
        @if (phase() === 'reconnecting') {
          <div class="absolute inset-x-0 top-20 z-20 mx-auto w-fit animate-pop-in rounded-full bg-amber-400/95 px-4 py-1.5 text-xs font-semibold text-black shadow-xl">
            Reconnecting to server…
          </div>
        } @else if (peerReconnecting()) {
          <div class="absolute inset-x-0 top-20 z-20 mx-auto w-fit animate-pop-in rounded-full bg-amber-500/90 px-4 py-1.5 text-xs font-semibold text-black shadow-xl">
            Their connection dropped — waiting up to 20s…
          </div>
        } @else if (remoteState() === 'disconnected') {
          <div class="absolute inset-x-0 top-20 z-20 mx-auto w-fit animate-pop-in rounded-full bg-amber-500/90 px-4 py-1.5 text-xs font-semibold text-black shadow-xl">
            Reconnecting…
          </div>
        }

        @if (mediaWarning()?.blocked) {
          <div class="absolute inset-x-0 top-28 z-20 mx-auto w-fit animate-pop-in rounded-full bg-red-500/95 px-4 py-1.5 text-xs font-semibold text-white shadow-xl">
            ⚠️ {{ mediaWarning()?.reason }}
          </div>
        }

        <!-- bottom control bar -->
        <div class="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-5 pt-14 pb-safe">
          <div class="mx-auto mb-2 flex max-w-lg items-center justify-between">
            <!-- left: mic -->
            <div class="flex flex-col items-center gap-1.5">
              <button (click)="toggleMic()" class="grid h-14 w-14 place-items-center rounded-full transition-all duration-300 active:scale-90"
                [class]="micOn() ? 'bg-ink-50/15 text-ink-50 backdrop-blur' : 'bg-red-500 text-ink-50 shadow-lg shadow-red-500/40'"
                aria-label="Toggle microphone">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
              </button>
              <span class="text-[10px] text-ink-50/60">{{ micOn() ? 'Mic' : 'Muted' }}</span>
            </div>

            <!-- center: skip -->
            <div class="flex flex-col items-center gap-1.5">
              <button (click)="skip()" class="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-[#e5234b] to-accent-coral text-ink-50 shadow-xl shadow-red-900/40 transition-transform duration-200 active:scale-90" aria-label="Skip to next person">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l10 8-10 8V4zM18 4h2.5v16H18z"/></svg>
              </button>
              <span class="font-display text-[11px] font-semibold text-ink-50/85">Next</span>
            </div>

            <!-- right: cam -->
            <div class="flex flex-col items-center gap-1.5">
              <button (click)="toggleCam()" class="grid h-14 w-14 place-items-center rounded-full transition-all duration-300 active:scale-90"
                [class]="camOn() ? 'bg-ink-50/15 text-ink-50 backdrop-blur' : 'bg-red-500 text-ink-50 shadow-lg shadow-red-500/40'"
                aria-label="Toggle camera">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
              </button>
              <span class="text-[10px] text-ink-50/60">{{ camOn() ? 'Cam' : 'Off' }}</span>
            </div>
          </div>

          <!-- secondary row -->
          <div class="mx-auto flex max-w-lg items-center justify-center gap-3 pb-2">
            <button (click)="switchCam()" class="chip hover:bg-ink-50/15 transition-colors">🔄 Flip</button>
            <button (click)="blockFlow()" class="chip hover:bg-red-500/20 text-red-300 transition-colors">🚫 Block</button>
            <button (click)="reportFlow()" class="chip hover:bg-ink-50/15 transition-colors">🚩 Report</button>
            <button (click)="reportMedia()" class="chip hover:bg-ink-50/15 transition-colors">📷 Media</button>
            <button (click)="end()" class="chip hover:bg-ink-50/15 transition-colors">⏹ End</button>
          </div>
        </div>
      }

      <!-- floating live chat bubbles over video -->
      @if (phase() === 'in-call' || phase() === 'matched') {
        <div class="pointer-events-none absolute inset-x-0 bottom-44 z-10 flex flex-col items-start gap-2 px-5">
          @for (m of chatMessages(); track m.id) {
            <div class="pointer-events-auto max-w-xs animate-bubble-in rounded-2xl bg-black/60 px-3.5 py-2 text-xs text-ink-50 backdrop-blur-md border border-ink-50/10 shadow-lg">
              <span class="font-semibold text-ink-50/70 mr-1.5">{{ m.fromUserId === myId() ? 'You' : peerName() }}:</span>
              <span>{{ m.text }}</span>
            </div>
          }
        </div>
      }

      <!-- quick chat drawer over video -->
      @if (phase() === 'in-call') {
        <div class="absolute inset-x-0 bottom-28 z-10 px-5">
          <form (ngSubmit)="send()" class="mx-auto flex max-w-lg items-center gap-2">
            <input class="input !bg-black/40 !backdrop-blur-xl" [ngModel]="draft()" (ngModelChange)="draft.set($event)" name="draft" placeholder="Say hi…" maxlength="240" (input)="onTyping()" />
            <button type="submit" class="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-500 text-ink-50 shadow-lg transition-transform active:scale-90" aria-label="Send">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            </button>
          </form>
        </div>
      }

      <!-- PEER LEFT / ENDED overlay -->
      @if (phase() === 'peer-left' || phase() === 'error') {
        <div class="absolute inset-0 z-30 grid place-items-center bg-ink-950/95 px-6 text-center">
          <div class="animate-pop-in glass-card w-full max-w-xs p-7">
            <div class="mb-3 text-4xl">{{ phase() === 'peer-left' ? '👋' : '📡' }}</div>
            <h2 class="font-display text-lg font-bold">{{ phase() === 'peer-left' ? 'They left the chat' : 'Something hiccupped' }}</h2>
            <p class="mt-2 text-sm text-ink-50/55">{{ phase() === 'peer-left' ? 'Want to meet someone else?' : error() ?? 'Network trouble. Try again.' }}</p>
            <div class="mt-6 space-y-2.5">
              <button class="btn-primary w-full" (click)="findPeer()">Next person →</button>
              <button class="btn-secondary w-full" (click)="end()">Back home</button>
            </div>
          </div>
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
export class VideoPage implements OnInit, OnDestroy {
  rt = inject(RealtimeService);
  auth = inject(AuthService);
  toast = inject(ToastService);
  router = inject(Router);
  zone = inject(NgZone);

  remoteVideo = viewChild.required<ElementRef<HTMLVideoElement>>('remoteVideo');
  pipVideo = viewChild<ElementRef<HTMLVideoElement>>('pipVideo');
  previewVideo = viewChild<ElementRef<HTMLVideoElement>>('previewVideo');

  phase = this.rt.phase;
  remoteState = this.rt.remoteState;
  peerReconnecting = this.rt.peerReconnecting;
  match = this.rt.matchInfo;
  mediaWarning = this.rt.mediaWarning;

  micOn = signal(true);
  camOn = signal(true);
  busy = signal(false);
  permError = signal<string | null>(null);
  remoteReady = signal(false);
  waitedSec = signal(0);
  draft = signal('');
  chatMessages = signal<Array<{ id: string; fromUserId: string; text: string }>>([]);

  private waitTimer: ReturnType<typeof setInterval> | null = null;
  private typingTimer: ReturnType<typeof setTimeout> | null = null;

  myId = signal('');
  peerName = computed(() => this.match()?.peer?.displayName || this.match()?.peer?.username || 'New friend');
  peerHue = computed(() => this.match()?.peer?.avatarHue ?? 210);
  peerVerified = computed(() => !!this.match()?.peer?.isVerified);
  peerBadges = computed(() => this.match()?.peer?.badges ?? []);
  sharedInterests = computed(() => this.match()?.sharedInterests ?? []);
  peerDistance = computed(() => this.match()?.peer?.distanceKm ?? null);

  showRating = signal(false);
  lastMatchId = signal('');
  lastPeerName = signal('');
  celebrating = signal(false);
  private ratedMatchIds = new Set<string>();
  private lastPhase = '';

  constructor() {
    effect(() => {
      const m = this.match();
      if (m) {
        this.lastMatchId.set(m.matchId);
        this.lastPeerName.set(m.peer?.displayName || m.peer?.username || 'your chat partner');
      }
      // Prompt for a rating when the peer leaves and we haven't rated this match yet.
      if (this.phase() === 'peer-left' && m && !this.ratedMatchIds.has(m.matchId)) {
        this.showRating.set(true);
      }
      // celebrate each new match
      const p = this.phase();
      if ((p === 'matched' || p === 'in-call') && this.lastPhase !== 'matched' && this.lastPhase !== 'in-call') {
        this.celebrating.set(true);
      }
      this.lastPhase = p;
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

  connectedLabel() {
    const s = this.remoteState();
    return s === 'connected' ? 'connected' : s === 'failed' ? 'failed' : 'connecting';
  }
  waitLabel() {
    const m = this.match();
    return m?.mode === 'VIDEO' ? 'Video' : 'Chat';
  }

  error() {
    return this.rt.errorMessage();
  }

  private onChatMessage = (msg: IncomingChat) =>
    this.zone.run(() => {
      this.chatMessages.update((list) => [...list.slice(-5), { id: msg.id, fromUserId: msg.fromUserId, text: msg.text }]);
      setTimeout(() => {
        this.chatMessages.update((list) => list.filter((m) => m.id !== msg.id));
      }, 7000);
    });

  private mediaWarningHandler: ((p: { blocked: boolean; reason: string }) => void) | null = null;

  async ngOnInit() {
    this.myId.set(this.auth.user()?.id ?? '');
    this.rt.on('chat:message', this.onChatMessage);
    this.mediaWarningHandler = (p: { blocked: boolean; reason: string }) => {
      this.zone.run(() => {
        this.rt.mediaWarning.set({ blocked: p.blocked, reason: p.reason });
      });
    };
    this.rt.on('media:warning', this.mediaWarningHandler);

    // poll remote stream signal (Angular signals have no .subscribe in stable API)
    const check = setInterval(() => {
      const s = this.rt.remoteStream();
      if (s && s !== this.lastRemote) {
        this.lastRemote = s;
        this.attachRemote(s);
      }
      if (!s && this.lastRemote) {
        this.lastRemote = null;
        this.attachRemote(null);
      }
    }, 300);
    this.remotePoll = check;
    await this.requestMedia();
  }

  private lastRemote: MediaStream | null = null;
  private remotePoll: ReturnType<typeof setInterval> | null = null;

  async requestMedia() {
    this.permError.set(null);
    try {
      const stream = await this.rt.ensureLocalMedia(true);
      const v = this.previewVideo()?.nativeElement;
      if (v) {
        v.srcObject = stream;
        v.play().catch(() => undefined);
      }
    } catch (e) {
      const name = (e as Error)?.name ?? '';
      if (name === 'NotAllowedError') {
        this.permError.set('Permission denied. Allow camera & mic in your browser settings to video chat.');
      } else if (name === 'NotFoundError') {
        this.permError.set('No camera or microphone found on this device.');
      } else {
        this.permError.set('Could not start your camera. Close other apps and retry.');
      }
    }
  }

  attachRemote(stream: MediaStream | null) {
    const v = this.remoteVideo()?.nativeElement;
    if (v && stream) {
      v.srcObject = stream;
      v.play().catch(() => undefined);
      stream.getVideoTracks()[0]?.addEventListener('unmute', () => this.remoteReady.set(true));
      const check = setInterval(() => {
        if ((v as HTMLVideoElement).videoWidth > 0) {
          this.remoteReady.set(true);
          clearInterval(check);
        }
      }, 400);
      setTimeout(() => clearInterval(check), 15000);
    } else if (v && !stream) {
      v.srcObject = null;
      this.remoteReady.set(false);
    }
    // PiP self-view
    const pip = this.pipVideo()?.nativeElement;
    if (pip) {
      pip.srcObject = this.rt.localStreamView ?? null;
      pip.play().catch(() => undefined);
    }
  }

  async startWaitTimer() {
    this.stopWaitTimer();
    this.waitedSec.set(0);
    this.waitTimer = setInterval(() => this.waitedSec.update((n) => n + 1), 1000);
  }
  private stopWaitTimer() {
    if (this.waitTimer) clearInterval(this.waitTimer);
    this.waitTimer = null;
  }

  async findPeer() {
    this.busy.set(true);
    try {
      await this.rt.connect(this.auth.access() ?? '');
    } catch (e) {
      this.toast.error('Could not connect. Check your network.');
      this.busy.set(false);
      return;
    }
    this.phase.set('waiting');
    this.startWaitTimer();
    const res = await this.rt.joinQueue('VIDEO');
    if (!res.ok) {
      this.toast.error(res.error ?? 'Queue unavailable');
      this.phase.set('error');
    }
    this.busy.set(false);
  }

  toggleMic() {
    this.micOn.update((v) => !v);
    this.rt.toggleMic(this.micOn());
  }

  toggleCam() {
    this.camOn.update((v) => !v);
    this.rt.toggleCam(this.camOn());
  }

  async switchCam() {
    await this.rt.switchCamera();
    this.toast.info('Camera flipped');
  }

  onTyping() {
    this.rt.sendTyping(true);
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => this.rt.sendTyping(false), 1600);
  }

  async send() {
    const text = this.draft().trim();
    if (!text) return;
    this.draft.set('');
    const r = await this.rt.sendMessage(text);
    if (!r.ok) this.toast.error(r.error ?? 'Message failed');
  }

  async skip() {
    this.stopWaitTimer();
    this.remoteReady.set(false);
    this.chatMessages.set([]);
    await this.rt.skip();
    this.phase.set('idle');
    this.permError.set(null);
    await this.requestMedia();
  }

  async blockFlow() {
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

  async reportFlow() {
    const peerId = this.match()?.peer?.userId;
    if (!peerId) return;
    // Professional flow: file the report, let the user decide next step.
    const r = await this.rt.reportPeer(peerId, 'OTHER', 'user-reported from video call');
    if (r.ok) {
      this.toast.success('Report sent. Our team will review. Skip or block anytime from the call bar.');
    } else {
      this.toast.error('Report failed — try again.');
    }
  }

  async reportMedia() {
    const match = this.match();
    if (!match) {
      this.toast.error('No active match');
      return;
    }
    try {
      // Capture a frame from the peer video (what the user is seeing) or local PiP.
      const videoEl = this.remoteVideo()?.nativeElement ?? this.pipVideo()?.nativeElement;
      if (!videoEl) {
        this.toast.error('No video element available');
        return;
      }
      if (videoEl.readyState < 2) {
        // HAVE_CURRENT_DATA not yet available; wait one frame and retry once.
        await new Promise((r) => setTimeout(r, 200));
      }
      if (videoEl.readyState < 2) {
        this.toast.error('Video frame not ready yet');
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth || 640;
      canvas.height = videoEl.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No canvas context');
      ctx.drawImage(videoEl, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      const r = await this.rt.sendMediaFrame(match.matchId, 'VIDEO_FRAME', dataUrl);
      if (r.blocked) {
        this.toast.error('Media flagged by moderation: ' + (r.labels.join(', ') || 'unknown'));
      } else {
        this.toast.info('Media frame sent (no issues detected)');
      }
    } catch {
      this.toast.error('Could not capture media frame');
    }
  }

  async end() {
    this.stopWaitTimer();
    this.rt.stopLocalMedia();
    await this.rt.endCall();
    await this.router.navigateByUrl('/home');
  }

  ngOnDestroy() {
    this.stopWaitTimer();
    if (this.remotePoll) clearInterval(this.remotePoll);
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.rt.off('chat:message', this.onChatMessage);
    if (this.mediaWarningHandler) {
      this.rt.off('media:warning', this.mediaWarningHandler);
      this.mediaWarningHandler = null;
    }
    this.rt.stopLocalMedia();
    void this.rt.leaveQueue();
  }
}
