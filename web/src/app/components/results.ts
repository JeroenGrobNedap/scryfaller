import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { BuilderStore } from '../builder.store';
import { scryfallUrl } from '../query/compiler';
import {
  ScryfallCard,
  ScryfallService,
  SearchResult,
  cardFaces,
  cardImage,
  manaCost,
  typeLine,
} from '../scryfall.service';
import { ShortlistService } from '../shortlist.service';
import { ManaCost } from './mana-cost';

type Status = SearchResult['status'] | 'idle' | 'loading';
interface View extends Omit<SearchResult, 'status'> {
  status: Status;
}

const IDLE: View = { status: 'idle', cards: [], total: 0, warnings: [], message: '' };
const DEBOUNCE_MS = 500;
const PAGE = 30;
const VIEW_KEY = 'scryfaller.view';

/** Live cards for the current query (first Scryfall page, up to 175), as images or a list. */
@Component({
  selector: 'app-results',
  imports: [ManaCost],
  host: { '(document:keydown)': 'onKey($event)' },
  template: `
    @let r = results();
    @if (r.status !== 'idle') {
      <section class="results" aria-live="polite">
        <div class="results-head">
          @switch (r.status) {
            @case ('loading') {
              <span class="muted">Searching Scryfall…</span>
            }
            @case ('ok') {
              <span><b>{{ r.total.toLocaleString() }}</b> {{ r.total === 1 ? 'card' : 'cards' }}</span>
            }
            @case ('empty') {
              <span class="muted">No cards match this query.</span>
            }
            @case ('error') {
              <span class="warn">{{ r.message }}</span>
            }
          }
          <span class="spacer"></span>
          @if (r.total > shown().length && r.status === 'ok') {
            <a [href]="url()" target="_blank" rel="noopener">All on Scryfall ↗</a>
          }
          <div class="segmented view-toggle" role="group" aria-label="View">
            <button type="button" class="small" [class.on]="view() === 'grid'" [attr.aria-pressed]="view() === 'grid'" (click)="setView('grid')">Images</button>
            <button type="button" class="small" [class.on]="view() === 'list'" [attr.aria-pressed]="view() === 'list'" (click)="setView('list')">List</button>
          </div>
        </div>
        @for (w of r.warnings; track $index) {
          <p class="warn small">Scryfall: {{ w }}</p>
        }

        @if (view() === 'grid') {
          <div class="card-grid" [class.stale]="r.status === 'loading'">
            @for (c of shown(); track c.id) {
              <div class="card-tile">
                <button type="button" class="tile-open" [title]="c.name" (click)="open(c)">
                  @if (image(c); as src) {
                    <img [src]="src" [alt]="c.name" loading="lazy" width="244" height="340" />
                  } @else {
                    <span class="card-name">{{ c.name }}</span>
                  }
                </button>
                <button
                  type="button"
                  class="pick"
                  [class.on]="shortlist.has(c.id)"
                  [attr.aria-pressed]="shortlist.has(c.id)"
                  [attr.aria-label]="(shortlist.has(c.id) ? 'Remove from shortlist: ' : 'Add to shortlist: ') + c.name"
                  [title]="shortlist.has(c.id) ? 'On your shortlist' : 'Add to shortlist'"
                  (click)="shortlist.toggle(c)"
                >
                  {{ shortlist.has(c.id) ? '✓' : '+' }}
                </button>
              </div>
            }
          </div>
        } @else {
          <table class="card-list" [class.stale]="r.status === 'loading'">
            <tbody>
              @for (c of shown(); track c.id) {
                <tr>
                  <td class="cl-pick">
                    <button
                      type="button"
                      class="pick inline"
                      [class.on]="shortlist.has(c.id)"
                      [attr.aria-pressed]="shortlist.has(c.id)"
                      [attr.aria-label]="(shortlist.has(c.id) ? 'Remove from shortlist: ' : 'Add to shortlist: ') + c.name"
                      (click)="shortlist.toggle(c)"
                    >
                      {{ shortlist.has(c.id) ? '✓' : '+' }}
                    </button>
                  </td>
                  <td class="cl-name"><button type="button" class="link" (click)="open(c)">{{ c.name }}</button></td>
                  <td class="cl-cost"><app-mana-cost [cost]="cost(c)" /></td>
                  <td class="cl-type muted">{{ type(c) }}</td>
                  <td class="cl-price">{{ price(c) }}</td>
                </tr>
              }
            </tbody>
          </table>
        }
        @if (shown().length < r.cards.length) {
          <button type="button" class="more-btn" (click)="limit.set(limit() + PAGE)">Show more</button>
        }
      </section>
    }

    @if (selected(); as c) {
      <div class="overlay" (click)="close()">
        <div class="preview card" role="dialog" aria-modal="true" [attr.aria-label]="c.name" (click)="$event.stopPropagation()">
          <div class="preview-img">
            @if (image(c, 'large'); as src) {
              <img [src]="src" [alt]="c.name" />
            }
          </div>
          <div class="preview-body">
            <div class="row">
              <span class="spacer"></span>
              <button type="button" class="icon ghost" title="Previous (←)" aria-label="Previous card" (click)="step(-1)">‹</button>
              <button type="button" class="icon ghost" title="Next (→)" aria-label="Next card" (click)="step(1)">›</button>
              <button type="button" class="icon ghost" title="Close (Esc)" aria-label="Close" (click)="close()">✕</button>
            </div>
            @for (f of faces(c); track $index) {
              <div class="face">
                <div class="face-head">
                  <h3>{{ f.name }}</h3>
                  <app-mana-cost [cost]="f.mana_cost ?? ''" />
                </div>
                <div class="muted">{{ f.type_line }}</div>
                <p class="oracle">{{ f.oracle_text }}</p>
              </div>
            }
            <div class="row prices">
              @if (c.prices?.usd) {
                <span>\${{ c.prices?.usd }}</span>
              }
              @if (c.prices?.eur) {
                <span>€{{ c.prices?.eur }}</span>
              }
              @if (!c.prices?.usd && !c.prices?.eur) {
                <span class="muted">No price</span>
              }
            </div>
            <div class="row">
              <button type="button" [class.primary-btn]="!shortlist.has(c.id)" (click)="shortlist.toggle(c)">
                {{ shortlist.has(c.id) ? '✓ On shortlist' : '+ Add to shortlist' }}
              </button>
              <a class="button" [href]="c.scryfall_uri" target="_blank" rel="noopener">Scryfall ↗</a>
              @if (c.related_uris?.edhrec; as edhrec) {
                <a class="button" [href]="edhrec" target="_blank" rel="noopener">EDHREC ↗</a>
              }
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class ResultsPanel {
  private readonly store = inject(BuilderStore);
  private readonly scryfall = inject(ScryfallService);
  protected readonly shortlist = inject(ShortlistService);

  protected readonly PAGE = PAGE;
  protected readonly results = signal<View>(IDLE);
  protected readonly limit = signal(PAGE);
  protected readonly shown = computed(() => this.results().cards.slice(0, this.limit()));
  protected readonly url = computed(() => scryfallUrl(this.store.query()));
  protected readonly view = signal<'grid' | 'list'>(readView());
  protected readonly selected = signal<ScryfallCard | null>(null);

  protected readonly image = cardImage;
  protected readonly faces = cardFaces;
  protected readonly cost = manaCost;
  protected readonly type = typeLine;

  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      const query = this.store.query();
      untracked(() => this.schedule(query));
    });
  }

  protected price(c: ScryfallCard): string {
    if (c.prices?.usd) return `$${c.prices.usd}`;
    if (c.prices?.eur) return `€${c.prices.eur}`;
    return '';
  }

  protected setView(v: 'grid' | 'list'): void {
    this.view.set(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // Not remembered; fine.
    }
  }

  protected open(c: ScryfallCard): void {
    this.selected.set(c);
  }

  protected close(): void {
    this.selected.set(null);
  }

  /** Previous / next card in the current results, wrapping around. */
  protected step(delta: number): void {
    const list = this.shown();
    const current = this.selected();
    if (!current || !list.length) return;
    const i = list.findIndex((c) => c.id === current.id);
    this.selected.set(list[(i + delta + list.length) % list.length]);
  }

  protected onKey(e: KeyboardEvent): void {
    if (!this.selected()) return;
    if (e.key === 'Escape') this.close();
    else if (e.key === 'ArrowLeft') this.step(-1);
    else if (e.key === 'ArrowRight') this.step(1);
    else return;
    e.preventDefault();
  }

  private schedule(query: string): void {
    clearTimeout(this.timer);
    this.limit.set(PAGE);
    if (!query.trim()) {
      this.results.set(IDLE);
      return;
    }
    // Keep the old cards on screen (dimmed) while the new ones load.
    this.results.update((r) => ({ ...r, status: 'loading', warnings: [] }));
    this.timer = setTimeout(async () => {
      const result = await this.scryfall.search(query);
      // Ignore answers for a query that has since changed.
      if (query === this.store.query()) this.results.set(result);
    }, DEBOUNCE_MS);
  }
}

function readView(): 'grid' | 'list' {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}
