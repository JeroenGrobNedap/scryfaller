import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { BuilderStore } from '../builder.store';
import { scryfallUrl } from '../query/compiler';

interface ScryfallCard {
  id: string;
  name: string;
  scryfall_uri: string;
  image_uris?: { normal?: string; small?: string };
  card_faces?: { image_uris?: { normal?: string; small?: string } }[];
}

interface Results {
  status: 'idle' | 'loading' | 'ok' | 'empty' | 'error';
  cards: ScryfallCard[];
  total: number;
  /** Scryfall warnings, e.g. a term it ignored. Worth showing: the query still "works" but matches too much. */
  warnings: string[];
  message: string;
}

const IDLE: Results = { status: 'idle', cards: [], total: 0, warnings: [], message: '' };
const DEBOUNCE_MS = 500;
const PAGE = 30;

/** Live cards for the current query, straight from the Scryfall API (first page, up to 175 cards). */
@Component({
  selector: 'app-results',
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
            <a [href]="url()" target="_blank" rel="noopener">See all on Scryfall ↗</a>
          }
        </div>
        @for (w of r.warnings; track $index) {
          <p class="warn small">Scryfall: {{ w }}</p>
        }
        <div class="card-grid" [class.stale]="r.status === 'loading'">
          @for (c of shown(); track c.id) {
            <a class="card-tile" [href]="c.scryfall_uri" target="_blank" rel="noopener" [title]="c.name">
              @if (image(c); as src) {
                <img [src]="src" [alt]="c.name" loading="lazy" width="244" height="340" />
              } @else {
                <span class="card-name">{{ c.name }}</span>
              }
            </a>
          }
        </div>
        @if (shown().length < r.cards.length) {
          <button type="button" class="more-btn" (click)="limit.set(limit() + PAGE)">Show more</button>
        }
      </section>
    }
  `,
})
export class ResultsPanel {
  private readonly store = inject(BuilderStore);
  protected readonly PAGE = PAGE;
  protected readonly results = signal<Results>(IDLE);
  protected readonly limit = signal(PAGE);
  protected readonly shown = computed(() => this.results().cards.slice(0, this.limit()));
  protected readonly url = computed(() => scryfallUrl(this.store.query()));

  private readonly cache = new Map<string, Results>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: AbortController | undefined;

  constructor() {
    effect(() => {
      const query = this.store.query();
      untracked(() => this.schedule(query));
    });
  }

  protected image(c: ScryfallCard): string | undefined {
    const uris = c.image_uris ?? c.card_faces?.[0]?.image_uris;
    return uris?.normal ?? uris?.small;
  }

  private schedule(query: string): void {
    clearTimeout(this.timer);
    this.inFlight?.abort();
    this.limit.set(PAGE);
    if (!query.trim()) {
      this.results.set(IDLE);
      return;
    }
    const cached = this.cache.get(query);
    if (cached) {
      this.results.set(cached);
      return;
    }
    // Keep the old cards on screen (dimmed) while the new ones load.
    this.results.update((r) => ({ ...r, status: 'loading', warnings: [] }));
    this.timer = setTimeout(() => this.fetch(query), DEBOUNCE_MS);
  }

  private async fetch(query: string): Promise<void> {
    const controller = new AbortController();
    this.inFlight = controller;
    try {
      const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      const body = await res.json();
      let result: Results;
      if (body.object === 'list') {
        result = {
          status: 'ok',
          cards: body.data ?? [],
          total: body.total_cards ?? 0,
          warnings: body.warnings ?? [],
          message: '',
        };
      } else if (res.status === 404) {
        result = { ...IDLE, status: 'empty', warnings: body.warnings ?? [] };
      } else {
        result = { ...IDLE, status: 'error', message: body.details ?? 'Scryfall could not run this query.' };
      }
      this.cache.set(query, result);
      this.results.set(result);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      this.results.set({ ...IDLE, status: 'error', message: "Couldn't reach Scryfall. Check your connection." });
    }
  }
}
