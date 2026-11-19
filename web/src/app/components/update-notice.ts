import { Component, DestroyRef, inject, signal } from '@angular/core';

const CHECK_EVERY_MS = 5 * 60 * 1000;

/** The hashed bundle name in a built page, e.g. `main-BN7GWUK4.js`. Null in `ng serve` (no hash). */
export function bundleName(html: string): string | null {
  return html.match(/main-[A-Z0-9]+\.js/)?.[0] ?? null;
}

/**
 * GitHub Pages lets browsers reuse the page for up to 10 minutes, so after a deploy an open tab
 * (or a quick revisit) can run the old version. This checks the live page now and then (and when
 * you come back to the tab) and offers a reload when a newer build is out.
 */
@Component({
  selector: 'app-update-notice',
  template: `
    @if (available()) {
      <div class="update-notice" role="status">
        <span>A new version of Scryfaller is available.</span>
        <button type="button" class="primary-btn small" (click)="reload()">Reload</button>
        <button type="button" class="icon ghost" aria-label="Dismiss" (click)="available.set(false)">✕</button>
      </div>
    }
  `,
})
export class UpdateNotice {
  protected readonly available = signal(false);
  private readonly current = bundleName(document.documentElement.outerHTML);

  constructor() {
    if (!this.current) return; // local dev server: nothing to compare against
    const check = () => void this.check();
    const onVisible = () => document.visibilityState === 'visible' && check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    });
    check();
  }

  protected reload(): void {
    location.reload();
  }

  private async check(): Promise<void> {
    if (this.available()) return;
    try {
      // The query string gets past any cache between us and GitHub Pages too.
      const res = await fetch(`${document.baseURI}?v=${Date.now()}`, { cache: 'no-store' });
      const live = bundleName(await res.text());
      if (live && live !== this.current) this.available.set(true);
    } catch {
      // Offline or blocked: try again next time.
    }
  }
}
