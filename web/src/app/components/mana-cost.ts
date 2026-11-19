import { Component, computed, input } from '@angular/core';

/** Renders `{2}{U}{U}` as small mana symbols (text only, no icon font needed). */
@Component({
  selector: 'app-mana-cost',
  template: `
    @for (s of symbols(); track $index) {
      <span class="sym" [class]="'sym sym-' + s.color" [title]="s.text">{{ s.label }}</span>
    }
  `,
  host: { class: 'mana-cost', '[attr.aria-label]': 'cost()' },
})
export class ManaCost {
  readonly cost = input('');

  protected readonly symbols = computed(() =>
    [...this.cost().matchAll(/\{([^}]+)\}/g)].map((m) => {
      const text = m[1].toUpperCase();
      // Hybrid / Phyrexian symbols like W/U or G/P take the color of their first letter.
      const letter = text.replace(/[^WUBRGC]/g, '')[0];
      return {
        text,
        label: text.replace('/P', 'ᵖ').replace('/', ''),
        color: letter ? letter.toLowerCase() : 'n',
      };
    }),
  );
}
