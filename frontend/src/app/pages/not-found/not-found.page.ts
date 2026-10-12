import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="mx-auto grid min-h-dvh w-full max-w-md place-items-center px-5 pt-safe pb-safe text-center">
      <div class="animate-pop-in glass-card w-full p-8">
        <div class="mb-3 text-5xl">🧭</div>
        <h1 class="font-display text-2xl font-extrabold">Lost in the crowd?</h1>
        <p class="mt-2 text-sm text-ink-50/55">That page doesn't exist. Let's get you back to people.</p>
        <div class="mt-6 space-y-2.5">
          <a routerLink="/" class="btn-primary w-full">Back to start</a>
          <a routerLink="/safety" class="btn-secondary w-full">Safety center</a>
        </div>
      </div>
    </div>
  `,
})
export class NotFoundPage {}
