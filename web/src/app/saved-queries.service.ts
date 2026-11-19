import { Injectable, signal } from '@angular/core';
import { BuilderState } from './query/model';

export interface SavedQuery {
  id: string;
  name: string;
  query: string;
  state: BuilderState;
  createdAt: string;
}

const STORAGE_KEY = 'scryfaller.saved';

/**
 * Saved queries live in this browser's localStorage, so the app needs no server.
 * Export/import JSON is the backup path (storage is per browser and can be cleared).
 */
@Injectable({ providedIn: 'root' })
export class SavedQueriesService {
  readonly items = signal<SavedQuery[]>(this.read());
  readonly error = signal<string | null>(null);

  save(name: string, query: string, state: BuilderState): void {
    const item: SavedQuery = {
      id: crypto.randomUUID(),
      name,
      query,
      state: structuredClone(state),
      createdAt: new Date().toISOString(),
    };
    this.write([item, ...this.items()]);
  }

  remove(id: string): void {
    this.write(this.items().filter((q) => q.id !== id));
  }

  /** Downloads all saved queries as a JSON file. */
  export(): void {
    const blob = new Blob([JSON.stringify(this.items(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scryfaller-queries-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Merges queries from an exported file; entries with an id we already have are skipped. */
  async import(file: File): Promise<number> {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!Array.isArray(parsed)) throw new Error('not a list');
      const valid = parsed.filter(
        (q): q is SavedQuery =>
          !!q && typeof q.id === 'string' && typeof q.name === 'string' && typeof q.query === 'string' && !!q.state,
      );
      const known = new Set(this.items().map((q) => q.id));
      const added = valid.filter((q) => !known.has(q.id));
      this.write([...added, ...this.items()]);
      return added.length;
    } catch {
      this.error.set("That file doesn't look like a Scryfaller export.");
      return 0;
    }
  }

  private read(): SavedQuery[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as SavedQuery[]) : [];
    } catch {
      return [];
    }
  }

  private write(items: SavedQuery[]): void {
    this.items.set(items);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      this.error.set(null);
    } catch {
      this.error.set('This browser blocked storage, so saved queries will be lost on reload. Use Export to keep them.');
    }
  }
}
