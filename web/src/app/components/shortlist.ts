import { Component, inject, signal } from '@angular/core';
import { ShortlistService } from '../shortlist.service';

/** The cards you picked, with one-click copy as a deck-site import list. */
@Component({
  selector: 'app-shortlist',
  template: `
    @if (list.items().length) {
      <section class="card shortlist" aria-label="Shortlist">
        <div class="row">
          <h2>Shortlist ({{ list.items().length }})</h2>
          <span class="spacer"></span>
          <button type="button" class="small" (click)="copy()" title="One card per line, e.g. “1 Rhystic Study”">
            {{ copied() ? 'Copied' : 'Copy for Moxfield / Archidekt' }}
          </button>
          <button type="button" class="small ghost" (click)="clear()">Clear</button>
        </div>
        <div class="pills">
          @for (item of list.items(); track item.id) {
            <span class="pill picked">
              <a [href]="item.scryfall_uri" target="_blank" rel="noopener">{{ item.name }}</a>
              <button type="button" class="x" [attr.aria-label]="'Remove ' + item.name" (click)="list.remove(item.id)">✕</button>
            </span>
          }
        </div>
      </section>
    }
  `,
})
export class Shortlist {
  protected readonly list = inject(ShortlistService);
  protected readonly copied = signal(false);

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.list.asText());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } catch {
      // Clipboard blocked: nothing else to do from here.
    }
  }

  protected clear(): void {
    if (confirm(`Remove all ${this.list.items().length} cards from your shortlist?`)) this.list.clear();
  }
}
