import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-safety-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="mx-auto w-full max-w-lg px-5 pt-safe pb-28">
      <header class="animate-fade-up flex items-center justify-between py-4">
        <button class="text-ink-50/60 transition-colors hover:text-ink-50" (click)="back()" aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <h1 class="font-display text-lg font-bold">Safety Center</h1>
        <span class="w-5"></span>
      </header>

      <section class="animate-fade-up glass-card border-mint/20 bg-mint/[0.04] p-5">
        <div class="flex items-center gap-3">
          <span class="grid h-11 w-11 place-items-center rounded-2xl bg-mint/15 text-xl">🛡️</span>
          <div>
            <h2 class="font-display text-[15px] font-bold">You're in control</h2>
            <p class="text-[12px] text-ink-50/50">Every match. One tap. Free forever.</p>
          </div>
        </div>
        <div class="mt-4 grid grid-cols-3 gap-2.5 text-center">
          <div class="rounded-2xl bg-ink-50/[0.04] p-3">
            <div class="text-xl">⏭️</div><div class="mt-1 text-[11px] font-medium">Skip</div>
          </div>
          <div class="rounded-2xl bg-ink-50/[0.04] p-3">
            <div class="text-xl">🚫</div><div class="mt-1 text-[11px] font-medium">Block</div>
          </div>
          <div class="rounded-2xl bg-ink-50/[0.04] p-3">
            <div class="text-xl">🚩</div><div class="mt-1 text-[11px] font-medium">Report</div>
          </div>
        </div>
      </section>

      <section class="animate-fade-up glass-card mt-4 p-5" style="animation-delay: 60ms">
        <h3 class="mb-3 font-display text-[15px] font-bold">Community rules</h3>
        <ul class="space-y-3 text-sm leading-relaxed text-ink-50/65">
          <li class="flex gap-2.5"><span>🔞</span><span><strong class="text-ink-50">18+ only.</strong> Accounts used by minors are removed and reported where required by law.</span></li>
          <li class="flex gap-2.5"><span>🚫</span><span><strong class="text-ink-50">No nudity or sexual content.</strong> Non-consensual sexual behavior gets you banned instantly.</span></li>
          <li class="flex gap-2.5"><span>💬</span><span><strong class="text-ink-50">No harassment or hate.</strong> Bullying, slurs, threats and stalking are never OK.</span></li>
          <li class="flex gap-2.5"><span>💰</span><span><strong class="text-ink-50">No scams.</strong> Never send money, crypto, gift cards or personal details to strangers here.</span></li>
          <li class="flex gap-2.5"><span>🪪</span><span><strong class="text-ink-50">No impersonation.</strong> Screenshotting others' info to harass or defraud is grounds for a permanent ban.</span></li>
        </ul>
      </section>

      <section class="animate-fade-up glass-card mt-4 p-5" style="animation-delay: 100ms">
        <h3 class="mb-3 font-display text-[15px] font-bold">How reporting works</h3>
        <div class="space-y-3 text-sm leading-relaxed text-ink-50/60">
          <p><strong class="text-ink-50/85">1.</strong> Tap 🚩 during or after a chat — it takes 2 seconds and you can keep it anonymous.</p>
          <p><strong class="text-ink-50/85">2.</strong> Our moderation queue reviews serious reports first; AI pre-screens text for high-risk content. AI helps our team but doesn't replace human review.</p>
          <p><strong class="text-ink-50/85">3.</strong> Consequences scale: warnings → matching restrictions → suspension → permanent ban. Repeat offenders are blocked from re-registering.</p>
          <p><strong class="text-ink-50/85">4.</strong> You can appeal any enforcement from this page — humans review every appeal.</p>
        </div>
      </section>

      <section class="animate-fade-up glass-card mt-4 p-5" style="animation-delay: 140ms">
        <h3 class="mb-3 font-display text-[15px] font-bold">Your privacy</h3>
        <ul class="space-y-2.5 text-sm text-ink-50/60">
          <li class="flex gap-2.5"><span class="text-mint">✓</span> Calls are <strong>never recorded</strong> in normal operation.</li>
          <li class="flex gap-2.5"><span class="text-mint">✓</span> Your contact info is never shared with matches.</li>
          <li class="flex gap-2.5"><span class="text-mint">✓</span> We don't collect identity documents by default; verification uses trusted providers with minimal retention.</li>
          <li class="flex gap-2.5"><span class="text-mint">✓</span> Delete your account anytime — data removal is automated.</li>
        </ul>
      </section>

      <section class="animate-fade-up glass-card mt-4 p-5" style="animation-delay: 180ms">
        <h3 class="mb-3 font-display text-[15px] font-bold">Need help?</h3>
        <p class="text-sm text-ink-50/60">
          In immediate danger, contact your local emergency services first.
          For account safety issues, report in-app — our team responds to HIGH severity reports within 24h.
        </p>
        <a routerLink="/register" class="btn-secondary mt-4 w-full !py-3 text-sm">Back to app</a>
      </section>
    </div>
  `,
})
export class SafetyPage {
  back() {
    window.history.back();
  }
}
