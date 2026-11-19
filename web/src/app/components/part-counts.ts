import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { BuilderStore } from '../builder.store';
import { compileNode, compileQuery, explainNode } from '../query/compiler';
import { Group, QueryNode, newGroup } from '../query/model';
import { ScryfallService } from '../scryfall.service';

interface Part {
  label: string;
  snippet: string;
  query: string;
}

const DEBOUNCE_MS = 600;

/**
 * "What this searches for", with how many cards each part matches on its own (plus your filters).
 * A part that matches nothing, or thousands, stands out right away. Counts load only while open.
 */
@Component({
  selector: 'app-part-counts',
  template: `
    <details class="explain-toggle" (toggle)="open.set($any($event.target).open)">
      <summary>What this searches for · cards per part</summary>
      @if (open()) {
        <table class="parts">
          <tbody>
            <tr>
              <td>Your filters alone</td>
              <td class="count">{{ show(base()) }}</td>
            </tr>
            @if (parts().length > 1) {
              <tr class="parts-op">
                <td colspan="2">
                  …and the card text must match
                  <b>{{ op() === 'or' ? 'any' : 'all' }}</b> of:
                </td>
              </tr>
            }
            @for (p of parts(); track p.query) {
              <tr>
                <td>
                  {{ p.label }}
                  <code class="snippet">{{ p.snippet }}</code>
                </td>
                <td class="count">{{ show(p.query) }}</td>
              </tr>
            } @empty {
              <tr><td colspan="2" class="muted">No card text yet.</td></tr>
            }
          </tbody>
        </table>
      }
    </details>
  `,
})
export class PartCounts {
  private readonly store = inject(BuilderStore);
  private readonly scryfall = inject(ScryfallService);

  protected readonly open = signal(false);
  private readonly counts = signal<Record<string, number | string>>({});

  /** The top-level parts; a lone group (like a recipe) is unwrapped so its pieces are counted. */
  private readonly top = computed<{ op: Group['op']; nodes: QueryNode[] }>(() => {
    this.store.query(); // the model is mutated in place; re-read whenever the query changes
    let group: Group = this.store.state().root;
    let nodes = group.children.filter((c) => compileNode(c).text);
    while (nodes.length === 1 && nodes[0].kind === 'group' && !nodes[0].negated) {
      group = nodes[0];
      nodes = group.children.filter((c) => compileNode(c).text);
    }
    return { op: group.op, nodes };
  });

  protected readonly op = computed(() => this.top().op);

  protected readonly base = computed(() => {
    this.store.query();
    return compileQuery({ filters: this.store.state().filters, root: newGroup('and', []) });
  });

  protected readonly parts = computed<Part[]>(() => {
    const filters = this.store.state().filters;
    return this.top().nodes.map((node) => ({
      label: explainNode(node).join(' ').trim() || 'Card text',
      snippet: compileNode(node).text,
      query: compileQuery({ filters, root: newGroup('and', [node]) }),
    }));
  });

  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const queries = [this.base(), ...this.parts().map((p) => p.query)];
      untracked(() => {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => queries.forEach((q) => this.count(q)), DEBOUNCE_MS);
      });
    });
  }

  protected show(query: string): string {
    const c = this.counts()[query];
    if (c === undefined) return '…';
    return typeof c === 'number' ? c.toLocaleString() : c;
  }

  private async count(query: string): Promise<void> {
    if (!query || this.counts()[query] !== undefined) return;
    const r = await this.scryfall.search(query);
    const value = r.status === 'ok' ? r.total : r.status === 'empty' ? 0 : '?';
    this.counts.update((c) => ({ ...c, [query]: value }));
  }
}
