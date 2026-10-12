import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { AvatarComponent } from '../../shared/ui';

@Component({
  selector: 'app-friends-page',
  standalone: true,
  imports: [FormsModule, AvatarComponent],
  template: `
    <div class="mx-auto w-full max-w-lg px-5 pt-safe pb-28">
      <header class="animate-fade-up flex items-center justify-between py-4">
        <button class="text-ink-50/60 transition-colors hover:text-ink-50" (click)="back()" aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <h1 class="font-display text-lg font-bold">Friends</h1>
        <span class="w-5"></span>
      </header>

      <!-- add friend -->
      <section class="animate-fade-up glass-card p-4">
        <div class="flex gap-2">
          <input class="input" [ngModel]="newUsername()" (ngModelChange)="newUsername.set($event)" name="newUsername" placeholder="Add by username…" (keydown.enter)="add()" />
          <button class="btn-primary !px-5 !py-3" (click)="add()" [disabled]="busy()">Add</button>
        </div>
      </section>

      <!-- requests -->
      @if (requests().length > 0) {
        <section class="animate-fade-up glass-card mt-4 p-4" style="animation-delay: 60ms">
          <h2 class="mb-3 font-display text-[13px] font-bold text-ink-50/75">Requests</h2>
          @for (r of requests(); track r.id) {
            <div class="mb-2 flex items-center justify-between rounded-2xl bg-ink-50/[0.04] p-3 last:mb-0">
              <div class="flex items-center gap-2.5">
                <app-avatar [name]="r.fromUsername" [size]="36" />
                <span class="text-sm font-medium">{{ r.fromUsername }}</span>
              </div>
              <div class="flex gap-2">
                <button (click)="respond(r.id, true)" class="chip !border-mint/40 !bg-mint/15 hover:!bg-mint/25 transition-colors">Accept</button>
                <button (click)="respond(r.id, false)" class="chip hover:bg-ink-50/15 transition-colors">No</button>
              </div>
            </div>
          }
        </section>
      }

      <!-- friend list -->
      <section class="animate-fade-up mt-4 space-y-2.5" style="animation-delay: 100ms">
        @if (friends().length === 0) {
          <div class="glass-card grid place-items-center p-10 text-center">
            <div>
              <div class="mb-3 text-4xl animate-float">🫂</div>
              <p class="text-sm text-ink-50/50">No friends yet.<br />Match someone and hit "Add friend"!</p>
            </div>
          </div>
        }
        @for (f of friends(); track f.id) {
          <div class="glass-card flex items-center justify-between p-4">
            <div class="flex items-center gap-3">
              <div class="relative">
                <app-avatar [name]="f.displayName" [hue]="f.avatarHue" [size]="44" />
                @if (f.isOnline) {
                  <span class="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-ink-900 bg-mint"></span>
                }
              </div>
              <div>
                <div class="font-display text-sm font-bold">{{ f.displayName }}</div>
                <div class="text-[11px] text-ink-50/45">{{ f.isOnline ? 'online now' : 'offline' }}</div>
              </div>
            </div>
            <button (click)="remove(f.id)" class="text-xs text-ink-50/40 transition-colors hover:text-red-300">Remove</button>
          </div>
        }
      </section>
    </div>
  `,
})
export class FriendsPage implements OnInit {
  api = inject(ApiService);
  toast = inject(ToastService);
  router = inject(Router);

  friends = signal<{ id: string; username: string; displayName: string; avatarHue: number; isOnline: boolean }[]>([]);
  requests = signal<{ id: string; fromUsername: string }[]>([]);
  newUsername = signal('');
  busy = signal(false);

  async ngOnInit() {
    await this.refresh();
  }

  async refresh() {
    try {
      const [f, r] = await Promise.all([firstValueFrom(this.api.friends()), firstValueFrom(this.api.friendRequests())]);
      this.friends.set(f ?? []);
      this.requests.set(r ?? []);
    } catch {
      this.toast.error('Could not load friends');
    }
  }

  async add() {
    const u = this.newUsername().trim();
    if (!u) return;
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.sendFriendRequest(u));
      this.toast.success(`Request sent to @${u}`);
      this.newUsername.set('');
    } catch (e) {
      this.toast.error((e as { error?: { message?: string } })?.error?.message ?? 'Could not send request');
    } finally {
      this.busy.set(false);
    }
  }

  async respond(id: string, accept: boolean) {
    try {
      await firstValueFrom(this.api.respondFriendRequest(id, accept));
      this.toast.success(accept ? 'Friend added 🎉' : 'Declined');
      await this.refresh();
    } catch {
      this.toast.error('Could not update request');
    }
  }

  async remove(id: string) {
    try {
      await firstValueFrom(this.api.removeFriend(id));
      this.toast.info('Friend removed');
      await this.refresh();
    } catch {
      this.toast.error('Could not remove friend');
    }
  }

  back() {
    void this.router.navigateByUrl('/home');
  }
}
