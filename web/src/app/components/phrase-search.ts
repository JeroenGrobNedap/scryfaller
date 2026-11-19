import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BuilderStore } from '../builder.store';
import { ParseResult, parsePhrase } from '../query/natural';

const EXAMPLES = [
  'surveil payoffs in azorius',
  'artifact and/or enchantment removal in black',
  'sacrifice outlets in boros',
  'repeatable scry or surveil in esper',
  'cheap creature removal in rakdos',
  'selesnya commanders that care about tokens',
  'sultai mana dorks',
];

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
          <button type="button" class="link" (click)="phrase.set(ex); run()">{{ ex }}</button>
        }
      </div>
    }
  `,
})
export class PhraseSearch {
  private readonly store = inject(BuilderStore);
  protected readonly phrase = signal('');
  protected readonly result = signal<ParseResult | null>(null);
  protected readonly examples = EXAMPLES;

  protected run(): void {
    const text = this.phrase().trim();
    if (!text) return;
    const r = parsePhrase(text);
    this.result.set(r);
    if (r.recognized.length) this.store.load(r.state);
  }
}
