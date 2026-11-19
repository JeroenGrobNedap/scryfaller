import { Injectable, computed, signal } from '@angular/core';
import { ScryfallCard } from './scryfall.service';

export interface ShortlistItem {
  id: string;
  name: string;
  scryfall_uri: string;
}

const STORAGE_KEY = 'scryfaller.shortlist';

/** Cards you picked from the results, kept in this browser, exportable as a deck-site import list. */
@Injectable({ providedIn: 'root' })
export class ShortlistService {
  readonly items = signal<ShortlistItem[]>(read());
  private readonly ids = computed(() => new Set(this.items().map((i) => i.id)));

  has(id: string): boolean {
    return this.ids().has(id);
  }

  toggle(card: ScryfallCard): void {
    if (this.has(card.id)) this.remove(card.id);
    else this.write([...this.items(), { id: card.id, name: card.name, scryfall_uri: card.scryfall_uri }]);
  }

  remove(id: string): void {
    this.write(this.items().filter((i) => i.id !== id));
  }

  clear(): void {
    this.write([]);
  }

  /** One `1 Card Name` per line: the format Moxfield, Archidekt and most deck sites import. */
  asText(): string {
    return this.items()
      .map((i) => `1 ${i.name}`)
      .join('\n');
  }

  private write(items: ShortlistItem[]): void {
    this.items.set(items);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Storage unavailable: the shortlist lasts until the page is closed.
    }
  }
}

function read(): ShortlistItem[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((i): i is ShortlistItem => !!i && typeof i.id === 'string' && typeof i.name === 'string')
      : [];
  } catch {
    return [];
  }
}
