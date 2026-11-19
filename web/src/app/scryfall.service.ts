import { Injectable } from '@angular/core';

export interface CardFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  image_uris?: { small?: string; normal?: string; large?: string };
}

export interface ScryfallCard {
  id: string;
  name: string;
  scryfall_uri: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  image_uris?: { small?: string; normal?: string; large?: string };
  card_faces?: CardFace[];
  prices?: { usd?: string | null; eur?: string | null };
  related_uris?: { edhrec?: string };
}

export interface SearchResult {
  status: 'ok' | 'empty' | 'error';
  cards: ScryfallCard[];
  total: number;
  /** Scryfall warnings, e.g. a term it ignored: the query "works" but matches too much. */
  warnings: string[];
  message: string;
}

/** Scryfall asks clients to keep 50–100 ms between requests. */
const SPACING_MS = 100;

/**
 * The one place that talks to the Scryfall API. Requests are spaced out and results are cached
 * per query for this page visit, so re-running a query (or counting its parts) is free.
 */
@Injectable({ providedIn: 'root' })
export class ScryfallService {
  private readonly cache = new Map<string, Promise<SearchResult>>();
  private nextSlot = 0;

  search(query: string): Promise<SearchResult> {
    const cached = this.cache.get(query);
    if (cached) return cached;
    const pending = this.run(query);
    this.cache.set(query, pending);
    // Network failures shouldn't stick: let the next try ask again.
    pending.then((r) => r.status === 'error' && !r.message.startsWith('Scryfall') && this.cache.delete(query));
    return pending;
  }

  private async run(query: string): Promise<SearchResult> {
    const now = Date.now();
    const wait = Math.max(0, this.nextSlot - now);
    this.nextSlot = now + wait + SPACING_MS;
    if (wait) await new Promise((r) => setTimeout(r, wait));

    try {
      const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}`, {
        headers: { Accept: 'application/json' },
      });
      const body = await res.json();
      if (body.object === 'list') {
        return {
          status: 'ok',
          cards: body.data ?? [],
          total: body.total_cards ?? 0,
          warnings: body.warnings ?? [],
          message: '',
        };
      }
      if (res.status === 404) {
        return { status: 'empty', cards: [], total: 0, warnings: body.warnings ?? [], message: '' };
      }
      return {
        status: 'error',
        cards: [],
        total: 0,
        warnings: [],
        message: `Scryfall: ${body.details ?? 'could not run this query.'}`,
      };
    } catch {
      return {
        status: 'error',
        cards: [],
        total: 0,
        warnings: [],
        message: "Couldn't reach Scryfall. Check your connection.",
      };
    }
  }
}

/** The image to show for a card; double-faced cards use their front face. */
export function cardImage(c: ScryfallCard, size: 'normal' | 'large' = 'normal'): string | undefined {
  const uris = c.image_uris ?? c.card_faces?.[0]?.image_uris;
  return uris?.[size] ?? uris?.normal ?? uris?.small;
}

/** Name, cost, type and text per face (one entry for normal cards). */
export function cardFaces(c: ScryfallCard): CardFace[] {
  if (c.card_faces?.length && c.card_faces.some((f) => f.oracle_text !== undefined)) return c.card_faces;
  return [{ name: c.name, mana_cost: c.mana_cost, type_line: c.type_line, oracle_text: c.oracle_text }];
}

/** Mana cost of the front face, e.g. `{2}{U}`. */
export function manaCost(c: ScryfallCard): string {
  return c.mana_cost ?? c.card_faces?.[0]?.mana_cost ?? '';
}

export function typeLine(c: ScryfallCard): string {
  return c.type_line ?? c.card_faces?.[0]?.type_line ?? '';
}
