/** The structured query model. The UI edits this; the compiler turns it into a Scryfall string. */

export type Color = 'w' | 'u' | 'b' | 'r' | 'g';

export interface Filters {
  /** Selected colors. Empty = no color filter (unless `colorless` is set). */
  colors: Color[];
  colorless: boolean;
  /** `identity` is what matters for commander decks; `color` is the card's actual color. */
  colorField: 'identity' | 'color';
  /** `<=` = fits within these colors, `=` = exactly, `>=` = at least these. */
  colorOp: '<=' | '=' | '>=';
  /** Format the card must be legal in, e.g. `commander`. Empty = any. */
  format: string;
  isCommander: boolean;
  /** Card types; multiple are OR-ed. */
  types: string[];
  /** Card types the card must NOT have, e.g. `land` → `-t:land`. */
  notTypes: string[];
  mvMin: number | null;
  mvMax: number | null;
  rarities: string[];
  /** Maximum price (inclusive) in `currency`. Null = any price. */
  priceMax: number | null;
  currency: 'usd' | 'eur';
  /** Commander "Game Changers" list: '' = don't care, 'exclude' = none (brackets 1–2), 'only' = just those. */
  gameChangers: '' | 'exclude' | 'only';
  /** Sort order appended as `order:...`. Empty = Scryfall default. */
  order: string;
}

export type AbilityKind = 'triggered' | 'activated' | 'anywhere';
export type TriggerWord = 'whenever' | 'when' | 'beginning';

/**
 * One ability described with clickable parts. Within a slot, multiple choices are OR-ed;
 * different slots are AND-ed. Multiple ability kinds are OR-ed.
 */
export interface AbilityClause {
  kind: 'ability';
  id: string;
  negated: boolean;
  abilityKinds: AbilityKind[];
  /** Triggered only. */
  triggers: TriggerWord[];
  /** Triggered only: who is involved in the trigger condition. */
  who: string[];
  /** Triggered (whenever/when): what happens in the condition. Activated: part of the cost. */
  conditions: string[];
  /** Triggered (at the beginning of): which step or phase. */
  phases: string[];
  /** What the ability does (after the comma or colon). */
  effects: string[];
}

/** Plain oracle text that must appear, e.g. `draw a card`. */
export interface TextClause {
  kind: 'text';
  id: string;
  negated: boolean;
  text: string;
}

/** Escape hatch: a raw Scryfall fragment inserted as-is. */
export interface RawClause {
  kind: 'raw';
  id: string;
  negated: boolean;
  text: string;
  /** Plain-language description, set when a recipe created this clause. */
  label?: string;
}

export interface Group {
  kind: 'group';
  id: string;
  negated: boolean;
  op: 'and' | 'or';
  children: QueryNode[];
}

export type QueryNode = Group | AbilityClause | TextClause | RawClause;

export interface BuilderState {
  filters: Filters;
  root: Group;
}

let counter = 0;
export function newId(): string {
  counter += 1;
  return `n${Date.now().toString(36)}${counter}`;
}

export function defaultFilters(): Filters {
  return {
    colors: [],
    colorless: false,
    colorField: 'identity',
    colorOp: '<=',
    format: 'commander',
    isCommander: false,
    types: [],
    notTypes: [],
    mvMin: null,
    mvMax: null,
    rarities: [],
    priceMax: null,
    currency: 'usd',
    gameChangers: '',
    order: '',
  };
}

export function newAbility(partial: Partial<AbilityClause> = {}): AbilityClause {
  return {
    kind: 'ability',
    id: newId(),
    negated: false,
    abilityKinds: ['triggered'],
    triggers: ['whenever'],
    who: [],
    conditions: [],
    phases: [],
    effects: [],
    ...partial,
  };
}

export function newText(text = ''): TextClause {
  return { kind: 'text', id: newId(), negated: false, text };
}

export function newRaw(text = '', label?: string): RawClause {
  return { kind: 'raw', id: newId(), negated: false, text, ...(label ? { label } : {}) };
}

export function newGroup(op: 'and' | 'or' = 'and', children: QueryNode[] = []): Group {
  return { kind: 'group', id: newId(), negated: false, op, children };
}

export function emptyState(): BuilderState {
  return { filters: defaultFilters(), root: newGroup('and', [newAbility()]) };
}
