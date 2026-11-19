import { Component, computed, inject, input } from '@angular/core';
import { BuilderStore } from '../builder.store';

export interface ChipOption {
  id: string;
  label: string;
  section?: string;
}

/** A row of toggleable chips. Mutates the `selected` array in place via the store. */
@Component({
  selector: 'app-chips',
  template: `
    @for (section of sections(); track section.name) {
      <div class="chip-section">
        @if (section.name) {
          <span class="section-name">{{ section.name }}</span>
        }
        @for (opt of section.options; track opt.id) {
          <button
            type="button"
            class="chip"
            [class.on]="selected().includes(opt.id)"
            [attr.aria-pressed]="selected().includes(opt.id)"
            (click)="store.toggle(selected(), opt.id)"
          >
            {{ opt.label }}
          </button>
        }
      </div>
    }
  `,
})
export class Chips {
  protected readonly store = inject(BuilderStore);
  readonly options = input.required<ChipOption[]>();
  readonly selected = input.required<string[]>();

  protected readonly sections = computed(() => {
    const out: { name: string; options: ChipOption[] }[] = [];
    for (const opt of this.options()) {
      const name = opt.section ?? '';
      let s = out.find((x) => x.name === name);
      if (!s) out.push((s = { name, options: [] }));
      s.options.push(opt);
    }
    return out;
  });
}
