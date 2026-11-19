import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BuilderStore } from '../builder.store';
import { compileFilters } from '../query/compiler';
import { defaultFilters } from '../query/model';
import { DECK_FILTERS, ParseResult, applyPhrase, parsePhrase } from '../query/natural';

const EXAMPLES = [
  'surveil payoffs in azorius',
  'artifact and/or enchantment removal in black',
  'sacrifice outlets in boros',
  'repeatable scry or surveil in esper',
  'cheap creature removal in rakdos',
  'selesnya commanders that care about tokens',
  'sultai mana dorks',
  'card draw staples in esper',
  'removal staples in gruul under $2',
  'protection in white without game changers',
];

const RECENT_KEY = 'scryfaller.recent';
const RECENT_MAX = 10;

/** Type what you want, press Enter: fills the builder (and so the query) from the phrase. */
@Component({
  selector: 'app-phrase-search',
  imports: [FormsModule],
  template: `
    <form class="phrase" (ngSubmit)="run()">
      <input
        class="phrase-input"
        name="phrase"
        autocomplete="off"
        placeholder="Type what you want, e.g. “surveil payoffs in azorius”, then press Enter"
        aria-label="Describe the cards you want"
        [(ngModel)]="phrase"
      />
      <button type="submit" class="primary-btn" [disabled]="!phrase().trim()">Build query</button>
    </form>

    @if (result(); as r) {
      <div class="feedback">
        @if (r.recognized.length) {
          <span class="muted">Understood:</span>
          @for (item of r.recognized; track $index) {
            <span class="tag" [title]="item.meaning"><b>{{ item.text }}</b> → {{ item.meaning }}</span>
          }
        }
        @if (r.unknown.length) {
          <span class="muted">Didn't understand:</span>
          @for (word of r.unknown; track $index) {
            <span class="tag unknown">{{ word }}</span>
          }
        }
        @if (kept(); as k) {
          <span class="muted">Kept from your filters:</span>
          <span class="tag"><code>{{ k }}</code></span>
        }
        @for (s of r.suggestions; track $index) {
          <span class="warn">
            Did you mean
            <button type="button" class="link" (click)="fix(s.word, s.suggestion)">{{ s.suggestion }}</button>
            instead of “{{ s.word }}”?
          </span>
        }
        @for (w of r.warnings; track $index) {
          <span class="warn">{{ w }}</span>
        }
        @if (!r.recognized.length) {
          <span class="warn">I didn't recognize anything in that, so the builder was left as it was.</span>
        }
      </div>
    } @else {
      <div class="feedback">
        <span class="muted">Try:</span>
        @for (ex of examples; track ex) {
          <button type="button" class="link" (click)="use(ex)">{{ ex }}</button>
        }
      </div>
    }

    @if (recent().length) {
      <div class="feedback">
        <span class="muted">Recent:</span>
        @for (r of recent(); track r) {
          <button type="button" class="link" (click)="use(r)">{{ r }}</button>
        }
        <button type="button" class="link muted" (click)="clearRecent()">clear</button>
      </div>
    }
  `,
})
export class PhraseSearch {
  private readonly store = inject(BuilderStore);
  protected readonly phrase = signal('');
  protected readonly result = signal<ParseResult | null>(null);
  protected readonly examples = EXAMPLES;
  protected readonly recent = signal<string[]>(readRecent());
  /** The filters that came from the panel instead of the phrase, as query text. */
  protected readonly kept = signal('');

  protected run(): void {
    const text = this.phrase().trim();
    if (!text) return;
    const r = parsePhrase(text);
    this.result.set(r);
    this.kept.set('');
    if (r.recognized.length) {
      const current = this.store.state().filters;
      this.kept.set(keptText(r, current));
      this.store.load(applyPhrase(r, current));
      this.remember(text);
    }
  }

  protected use(text: string): void {
    this.phrase.set(text);
    this.run();
  }

  /** Replaces a misspelled word with the suggestion and runs the search again. */
  protected fix(word: string, suggestion: string): void {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const misspelled = this.phrase().trim();
    // The corrected phrase takes the misspelled one's place in Recent.
    this.recent.update((list) => list.filter((r) => r !== misspelled));
    this.use(this.phrase().replace(new RegExp(`\\b${escaped}\\b`, 'i'), suggestion));
  }

  protected clearRecent(): void {
    this.recent.set([]);
    writeRecent([]);
  }

  private remember(text: string): void {
    const list = [text, ...this.recent().filter((r) => r.toLowerCase() !== text.toLowerCase())].slice(
      0,
      RECENT_MAX,
    );
    this.recent.set(list);
    writeRecent(list);
  }
}

function keptText(r: ParseResult, current: ReturnType<typeof defaultFilters>): string {
  const only = { ...defaultFilters(), format: '' };
  for (const key of DECK_FILTERS) {
    if (!r.mentioned.includes(key)) (only as Record<string, unknown>)[key] = current[key];
  }
  return compileFilters(only).join(' ');
}

function readRecent(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeRecent(list: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Storage unavailable: recent searches just aren't kept.
  }
}
