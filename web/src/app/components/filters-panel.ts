import { Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BuilderStore } from '../builder.store';
import { Color, Filters } from '../query/model';
import { CARD_TYPES, FORMATS, ORDERS, RARITIES } from '../query/vocabulary';
import { Chips } from './chips';

const COLORS: { id: Color; label: string }[] = [
  { id: 'w', label: 'W' },
  { id: 'u', label: 'U' },
  { id: 'b', label: 'B' },
  { id: 'r', label: 'R' },
  { id: 'g', label: 'G' },
];

@Component({
  selector: 'app-filters-panel',
  imports: [FormsModule, Chips],
  template: `
    @let f = filters();
    <div class="filters">
      <div class="slot">
        <span class="slot-label">Colors</span>
        <div class="row">
          @for (c of colors; track c.id) {
            <button
              type="button"
              class="mana mana-{{ c.id }}"
              [class.on]="f.colors.includes(c.id)"
              [attr.aria-pressed]="f.colors.includes(c.id)"
              [disabled]="f.colorless"
              (click)="store.toggle(f.colors, c.id)"
            >
              {{ c.label }}
            </button>
          }
          <label class="check">
            <input type="checkbox" [(ngModel)]="f.colorless" (ngModelChange)="store.touch()" /> Colorless
          </label>
        </div>
        <div class="row">
          <select [(ngModel)]="f.colorField" (ngModelChange)="store.touch()" aria-label="Color field">
            <option value="identity">Color identity (commander)</option>
            <option value="color">Card color</option>
          </select>
          <select [(ngModel)]="f.colorOp" (ngModelChange)="store.touch()" aria-label="Color match">
            <option value="<=">fits within these colors</option>
            <option value="=">exactly these colors</option>
            <option value=">=">at least these colors</option>
          </select>
        </div>
      </div>

      <div class="slot">
        <span class="slot-label">Format & role</span>
        <div class="row">
          <select [(ngModel)]="f.format" (ngModelChange)="store.touch()" aria-label="Format">
            @for (fmt of formats; track fmt) {
              <option [value]="fmt">{{ fmt || 'Any format' }}</option>
            }
          </select>
          <label class="check">
            <input type="checkbox" [(ngModel)]="f.isCommander" (ngModelChange)="store.touch()" /> Can be a commander
          </label>
        </div>
      </div>

      <div class="slot">
        <span class="slot-label">Card type (any of)</span>
        <app-chips [options]="types" [selected]="f.types" />
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

      <div class="slot">
        <span class="slot-label">Sort by</span>
        <select [(ngModel)]="f.order" (ngModelChange)="store.touch()" aria-label="Sort order">
          @for (o of orders; track o.id) {
            <option [value]="o.id">{{ o.label }}</option>
          }
        </select>
      </div>
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
}
