import { Injectable, computed, signal } from '@angular/core';
import { compileNode, compileQuery, explainNode } from './query/compiler';
import { BuilderState, Group, QueryNode, emptyState } from './query/model';

const DRAFT_KEY = 'scryfaller.draft';

/**
 * Holds the builder state. Editors mutate the model objects in place and then call `touch()`,
 * which re-computes the query string and saves a draft to localStorage.
 */
@Injectable({ providedIn: 'root' })
export class BuilderStore {
  readonly state = signal<BuilderState>(loadDraft() ?? emptyState());
  private readonly version = signal(0);

  readonly query = computed(() => {
    this.version();
    return compileQuery(this.state());
  });

  readonly explanation = computed(() => {
    this.version();
    return explainNode(this.state().root);
  });

  touch(): void {
    this.version.update((v) => v + 1);
    saveDraft(this.state());
  }

  load(state: BuilderState): void {
    this.state.set(structuredClone(state));
    this.touch();
  }

  reset(): void {
    this.load(emptyState());
  }

  toggle<T extends string>(list: T[], id: T): void {
    const i = list.indexOf(id);
    if (i === -1) list.push(id);
    else list.splice(i, 1);
    this.touch();
  }

  add(parent: Group, node: QueryNode): void {
    parent.children.push(node);
    this.touch();
  }

  remove(parent: Group, node: QueryNode): void {
    parent.children = parent.children.filter((c) => c !== node);
    this.touch();
  }

  /** Compiled snippet for a single node, shown under each block. */
  snippet(node: QueryNode): string {
    this.version();
    return compileNode(node).text;
  }
}

function loadDraft(): BuilderState | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as BuilderState) : null;
  } catch {
    return null;
  }
}

function saveDraft(state: BuilderState): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable (private mode etc.): the draft just isn't kept.
  }
}
