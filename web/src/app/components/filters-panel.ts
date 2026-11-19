import { Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BuilderStore } from '../builder.store';
import { Color, Filters } from '../query/model';
import { CARD_TYPES, FORMATS, ORDERS, RARITIES } from '../query/vocabulary';
import { Chips } from './chips';

const COLORS: { id: Color; label: string; name: string }[] = [
  { id: 'w', label: 'W', name: 'White' },
  { id: 'u', label: 'U', name: 'Blue' },
  { id: 'b', label: 'B', name: 'Black' },
  { id: 'r', label: 'R', name: 'Red' },
  { id: 'g', label: 'G', name: 'Green' },
];

/** One compact bar for deck-wide filters; less-used ones fold away under "More". */
@Component({
  selector: 'app-filters-panel',
  imports: [FormsModule, Chips],
  template: `
    @let f = filters();
    <div class="filterbar">
      <div class="pips" role="group" aria-label="Colors">
        @for (c of colors; track c.id) {
          <button
            type="button"
            class="mana mana-{{ c.id }}"
            [class.on]="f.colors.includes(c.id)"
            [attr.aria-pressed]="f.colors.includes(c.id)"
            [attr.aria-label]="c.name"
            [title]="c.name"
            [disabled]="f.colorless"
            (click)="store.toggle(f.colors, c.id)"
          >
            {{ c.label }}
          </button>
        }
        <button
          type="button"
          class="mana mana-c"
          [class.on]="f.colorless"
          [attr.aria-pressed]="f.colorless"
          aria-label="Colorless"
          title="Colorless"
          (click)="f.colorless = !f.colorless; store.touch()"
        >
          C
        </button>
      </div>

      <select [(ngModel)]="f.colorOp" (ngModelChange)="store.touch()" aria-label="Color match" title="How colors match">
        <option value="<=">within</option>
        <option value="=">exactly</option>
        <option value=">=">at least</option>
      </select>

      <select [(ngModel)]="f.format" (ngModelChange)="store.touch()" aria-label="Format">
        @for (fmt of formats; track fmt) {
          <option [value]="fmt">{{ fmt || 'any format' }}</option>
        }
      </select>

      <select [(ngModel)]="f.gameChangers" (ngModelChange)="store.touch()" aria-label="Game Changers">
        <option value="">any Game Changers</option>
        <option value="exclude">no Game Changers</option>
        <option value="only">only Game Changers</option>
      </select>

      <label class="field" title="Maximum price">
        <span>≤</span>
        <input type="number" min="0" step="0.5" class="num" placeholder="price" [(ngModel)]="f.priceMax" (ngModelChange)="store.touch()" aria-label="Maximum price" />
        <select [(ngModel)]="f.currency" (ngModelChange)="store.touch()" aria-label="Currency">
          <option value="usd">$</option>
          <option value="eur">€</option>
        </select>
      </label>

      <select [(ngModel)]="f.order" (ngModelChange)="store.touch()" aria-label="Sort order">
        @for (o of orders; track o.id) {
          <option [value]="o.id">{{ o.id ? 'sort: ' + o.label : 'default sort' }}</option>
        }
      </select>

      <details class="more">
        <summary>More{{ moreCount(f) ? ' (' + moreCount(f) + ')' : '' }}</summary>
        <div class="more-body">
          <div class="slot">
            <span class="slot-label">Colors are</span>
            <select [(ngModel)]="f.colorField" (ngModelChange)="store.touch()" aria-label="Color field">
              <option value="identity">color identity (commander)</option>
              <option value="color">the card's color</option>
            </select>
          </div>
          <div class="slot">
            <span class="slot-label">Card type (any of)</span>
            <app-chips [options]="types" [selected]="f.types" />
          </div>
          <div class="slot">
            <span class="slot-label">Not these types</span>
            <app-chips [options]="types" [selected]="f.notTypes" />
          </div>
          <div class="slot">
            <span class="slot-label">Mana value</span>
            <div class="row">
              <input type="number" min="0" class="num" placeholder="min" [(ngModel)]="f.mvMin" (ngModelChange)="store.touch()" aria-label="Minimum mana value" />
              <span>to</span>
              <input type="number" min="0" class="num" placeholder="max" [(ngModel)]="f.mvMax" (ngModelChange)="store.touch()" aria-label="Maximum mana value" />
            </div>
          </div>
          <div class="slot">
            <span class="slot-label">Rarity (any of)</span>
            <app-chips [options]="rarities" [selected]="f.rarities" />
          </div>
          <label class="check">
            <input type="checkbox" [(ngModel)]="f.isCommander" (ngModelChange)="store.touch()" /> Can be a commander
          </label>
        </div>
      </details>
    </div>
  `,
})
export class FiltersPanel {
  protected readonly store = inject(BuilderStore);
  readonly filters = input.required<Filters>();

  protected readonly colors = COLORS;
  protected readonly formats = FORMATS;
  protected readonly orders = ORDERS;
  protected readonly types = CARD_TYPES.map((t) => ({ id: t, label: t }));
  protected readonly rarities = RARITIES.map((r) => ({ id: r, label: r }));

  /** How many of the folded-away filters are in use, shown on the "More" toggle. */
  protected moreCount(f: Filters): number {
    return (
      (f.colorField === 'color' ? 1 : 0) +
      f.types.length +
      f.notTypes.length +
      (f.mvMin !== null || f.mvMax !== null ? 1 : 0) +
      f.rarities.length +
      (f.isCommander ? 1 : 0)
    );
  }
}
