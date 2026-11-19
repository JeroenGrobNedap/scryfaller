import { Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BuilderStore } from '../builder.store';
import { Group, QueryNode, newAbility, newGroup, newRaw, newText } from '../query/model';
import { AbilityEditor } from './ability-editor';

const KIND_TITLE: Record<QueryNode['kind'], string> = {
  group: 'Group',
  ability: 'Ability',
  text: 'Text contains',
  raw: 'Raw Scryfall',
};

/** Renders any node; groups render their children recursively. */
@Component({
  selector: 'app-node-editor',
  imports: [AbilityEditor, FormsModule],
  template: `
    @let n = node();
    <section class="block" [class.group]="n.kind === 'group'" [class.negated]="n.negated">
      <header class="block-head">
        @if (n.kind === 'group') {
          <div class="segmented" role="group" aria-label="Combine children with">
            <button type="button" [class.on]="n.op === 'and'" (click)="n.op = 'and'; store.touch()">ALL of</button>
            <button type="button" [class.on]="n.op === 'or'" (click)="n.op = 'or'; store.touch()">ANY of</button>
          </div>
        } @else {
          <span class="block-title">{{ title(n) }}</span>
        }
        <span class="spacer"></span>
        <label class="not-toggle">
          <input type="checkbox" [(ngModel)]="n.negated" (ngModelChange)="store.touch()" />
          NOT
        </label>
        @if (parent(); as p) {
          <button type="button" class="icon" title="Remove" aria-label="Remove" (click)="store.remove(p, n)">✕</button>
        }
      </header>

      @switch (n.kind) {
        @case ('group') {
          <div class="children">
            @for (child of n.children; track child.id) {
              <app-node-editor [node]="child" [parent]="n" />
            } @empty {
              <p class="muted">Empty group, add something below.</p>
            }
          </div>
          <div class="add-row">
            <button type="button" (click)="add(n, 'ability')">+ Ability</button>
            <button type="button" (click)="add(n, 'text')">+ Text</button>
            <button type="button" (click)="add(n, 'raw')">+ Raw</button>
            <button type="button" (click)="add(n, 'group')">+ Group</button>
          </div>
        }
        @case ('ability') {
          <app-ability-editor [ability]="n" />
        }
        @case ('text') {
          <input
            class="text-input"
            placeholder="e.g. draw a card"
            [(ngModel)]="n.text"
            (ngModelChange)="store.touch()"
          />
        }
        @case ('raw') {
          <input
            class="text-input mono"
            placeholder="e.g. otag:card-advantage pow>=3"
            [(ngModel)]="n.text"
            (ngModelChange)="store.touch()"
          />
        }
      }

      @if (n.kind !== 'group' && store.snippet(n); as snip) {
        <code class="snippet">{{ snip }}</code>
      }
    </section>
  `,
})
export class NodeEditor {
  protected readonly store = inject(BuilderStore);
  readonly node = input.required<QueryNode>();
  readonly parent = input<Group | null>(null);

  protected title(n: QueryNode): string {
    return n.kind === 'raw' && n.label ? n.label : KIND_TITLE[n.kind];
  }

  protected add(group: Group, kind: QueryNode['kind']): void {
    const node =
      kind === 'ability' ? newAbility() : kind === 'text' ? newText() : kind === 'raw' ? newRaw() : newGroup('or');
    this.store.add(group, node);
  }
}
