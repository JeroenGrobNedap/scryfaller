/**
 * Everything you can click in the builder. Each term carries the regex fragment that matches its
 * wording variants in Scryfall oracle text (case-insensitive, `~` = the card's own name).
 *
 * Adding a mechanic = adding a line here. Patterns must be valid inside `o:/.../`:
 * escape `/` as `\/`, don't use lookarounds, and use at most one level of parentheses
 * (Scryfall rejects regexes nested more than 2 deep; the compiler adds the second level).
 */

export interface Term {
  id: string;
  label: string;
  pattern: string;
  /** Optional grouping for display. */
  section?: string;
}

export const TRIGGERS: Term[] = [
  { id: 'whenever', label: 'Whenever', pattern: 'whenever' },
  { id: 'when', label: 'When', pattern: 'when ' },
  { id: 'beginning', label: 'At the beginning of', pattern: 'at the beginning of' },
];

export const WHO: Term[] = [
  { id: 'you', label: 'you', pattern: 'you' },
  { id: 'opponent', label: 'opponent(s)', pattern: 'opponent' },
  { id: 'player', label: 'a / each player', pattern: 'player' },
  { id: 'creature-you-control', label: 'creature you control', pattern: 'creatures? you control' },
  { id: 'another-creature', label: 'another creature', pattern: 'another creature' },
  { id: 'self', label: 'this card (~)', pattern: '~' },
];

export const PHASES: Term[] = [
  { id: 'upkeep', label: 'upkeep', pattern: 'upkeep' },
  { id: 'draw-step', label: 'draw step', pattern: 'draw step' },
  { id: 'combat', label: 'combat', pattern: 'combat' },
  { id: 'main', label: 'main phase', pattern: 'main phase' },
  { id: 'end-step', label: 'end step', pattern: 'end step' },
];

/** Used both as trigger conditions ("whenever you scry") and as effects ("..., scry 2"). */
export const ACTIONS: Term[] = [
  // Library manipulation
  { id: 'scry', label: 'scry', pattern: 'scr[yi]', section: 'Library' },
  { id: 'surveil', label: 'surveil', pattern: 'surveil', section: 'Library' },
  { id: 'look-top', label: 'look at the top card', pattern: 'look at the top', section: 'Library' },
  { id: 'reveal-top', label: 'reveal the top card', pattern: 'reveal the top', section: 'Library' },
  { id: 'exile-top', label: 'exile the top card', pattern: 'exile the top', section: 'Library' },
  { id: 'mill', label: 'mill', pattern: 'mill', section: 'Library' },
  { id: 'draw', label: 'draw', pattern: 'draw', section: 'Library' },
  { id: 'discard', label: 'discard', pattern: 'discard', section: 'Library' },
  { id: 'search-library', label: 'search library', pattern: 'search [^,.]*library', section: 'Library' },

  // Creatures & combat
  { id: 'deals-damage', label: 'deals damage', pattern: 'deals? [^,.]*damage', section: 'Combat' },
  { id: 'combat-damage', label: 'deals combat damage', pattern: 'deals? combat damage', section: 'Combat' },
  { id: 'attacks', label: 'attacks', pattern: 'attack', section: 'Combat' },
  { id: 'blocks', label: 'blocks', pattern: 'blocks', section: 'Combat' },
  { id: 'dies', label: 'dies', pattern: 'dies', section: 'Combat' },
  { id: 'enters', label: 'enters', pattern: 'enters', section: 'Combat' },
  { id: 'leaves', label: 'leaves the battlefield', pattern: 'leaves the battlefield', section: 'Combat' },

  // Resources
  { id: 'sacrifice', label: 'sacrifice', pattern: 'sacrific', section: 'Resources' },
  { id: 'cast', label: 'cast a spell', pattern: 'cast', section: 'Resources' },
  { id: 'extra-land', label: 'play an additional land', pattern: 'additional lands?', section: 'Resources' },
  { id: 'land-enters', label: 'land enters', pattern: 'lands? [^,.]*enters', section: 'Resources' },
  { id: 'create-token', label: 'create a token', pattern: 'creates? [^.]*token', section: 'Resources' },
  { id: 'token', label: 'token (any mention)', pattern: 'tokens?', section: 'Resources' },
  { id: 'counter-p1', label: '+1/+1 counter', pattern: '\\+1\\/\\+1 counter', section: 'Resources' },
  { id: 'gain-life', label: 'gain life', pattern: 'gains? [^,.]*life', section: 'Resources' },
  { id: 'lose-life', label: 'lose life', pattern: 'loses? [^,.]*life', section: 'Resources' },
  { id: 'untap', label: 'untap', pattern: 'untap', section: 'Resources' },

  // Graveyard & exile
  { id: 'return-graveyard', label: 'return from graveyard', pattern: 'return[^.]*from [^.]*graveyard', section: 'Graveyard' },
  { id: 'exile', label: 'exile', pattern: 'exile', section: 'Graveyard' },

  // Stealing
  { id: 'gain-control', label: 'gain control of', pattern: 'gain control of', section: 'Stealing' },
  {
    id: 'cast-opponents',
    label: "cast/play opponents' cards",
    pattern: "(cast|play)[^.]*(you don't own|opponents? owns?)",
    section: 'Stealing',
  },
];

export const CARD_TYPES = [
  'creature', 'instant', 'sorcery', 'artifact', 'enchantment', 'planeswalker', 'land', 'battle', 'legendary',
];

export const RARITIES = ['common', 'uncommon', 'rare', 'mythic'];

export const FORMATS = ['', 'commander', 'brawl', 'oathbreaker', 'pauper', 'modern', 'standard', 'legacy', 'vintage'];

export const ORDERS = [
  { id: '', label: 'Scryfall default' },
  { id: 'edhrec', label: 'EDHREC rank' },
  { id: 'cmc', label: 'Mana value' },
  { id: 'name', label: 'Name' },
  { id: 'released', label: 'Release date' },
  { id: 'usd', label: 'Price (USD)' },
];

export function findTerm(list: Term[], id: string): Term | undefined {
  return list.find((t) => t.id === id);
}
