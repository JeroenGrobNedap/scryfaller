/**
 * Rule-based "type what you want" parser. No AI: it looks for known words and phrases
 * (colors, roles, mechanics, card types, mana value) and turns them into a builder state.
 *
 *   "surveil payoffs in azorius"                → payoff + surveil + W/U
 *   "artifact and/or enchantment removal in black" → removal of artifacts/enchantments + B
 *   "sacrifice outlets in boros"                → outlet + sacrifice + R/W
 *
 * To teach it new words, add entries to COLOR_WORDS, ROLE_WORDS, MECHANIC_WORDS or TYPE_WORDS.
 */
import {
  BuilderState,
  Color,
  Filters,
  QueryNode,
  defaultFilters,
  newAbility,
  newGroup,
  newRaw,
} from './model';

export type Role =
  | 'payoff'
  | 'enabler'
  | 'repeatable'
  | 'outlet'
  | 'removal'
  | 'wipe'
  | 'bounce'
  | 'counterspell'
  | 'ramp'
  | 'tutor'
  | 'recursion'
  | 'protection'
  | 'fixing'
  | 'finisher'
  | 'extra-turn'
  | 'evasion'
  | 'stax'
  | 'free'
  | 'graveyard-hate';

/** Roles where card types mean "what it hits / finds" instead of "what the card is". */
const ROLE_EXAMPLE: Partial<Record<Role, string>> = {
  payoff: 'scry payoffs',
  enabler: 'token makers',
  repeatable: 'repeatable surveil',
  outlet: 'sacrifice outlets',
};

const TARGETED_ROLES: Role[] = ['removal', 'wipe', 'bounce', 'tutor', 'recursion'];
/** Roles that need a mechanic to make sense ("payoffs" of what?). */
const MECHANIC_ROLES: Role[] = ['payoff', 'enabler', 'repeatable', 'outlet'];

interface Ctx {
  colors: Set<Color>;
  colorless: boolean;
  roles: Set<Role>;
  mechanics: Set<string>;
  types: Set<string>;
  /** "not lands", "without sacrifice": excluded card types and mechanics. */
  notTypes: Set<string>;
  notMechanics: Set<string>;
  /** Steps from "every upkeep", "at your end step", … (PHASES ids). */
  phases: Set<string>;
  /** "whenever X then Y": X goes in `conditions`, Y in `effects` (instead of `mechanics`). */
  ifThen: boolean;
  conditions: Set<string>;
  effects: Set<string>;
  format: string | null;
  isCommander: boolean;
  mvMin: number | null;
  mvMax: number | null;
  /** "staples": sort by EDHREC popularity so the most-played cards come first. */
  staples: boolean;
  priceMax: number | null;
  currency: 'usd' | 'eur';
  gameChangers: '' | 'exclude' | 'only';
  /** Leftover words that are rules-text words or creature types (see GIST_WORDS). */
  gist: GistWord[];
}

interface Entry {
  /** Regex source matched against the normalized input, on word boundaries. */
  pattern: string;
  meaning: string | ((m: RegExpMatchArray) => string);
  apply: (ctx: Ctx, m: RegExpMatchArray) => void;
}

// ---------------------------------------------------------------------------------------------
// Dictionaries

const colors = (letters: string) => (ctx: Ctx) => {
  for (const c of letters) ctx.colors.add(c as Color);
};

const COLOR_GROUPS: [string, string][] = [
  // Guilds
  ['azorius', 'wu'],
  ['dimir', 'ub'],
  ['rakdos', 'br'],
  ['gruul', 'rg'],
  ['selesnya', 'gw'],
  ['orzhov', 'wb'],
  ['izzet', 'ur'],
  ['golgari', 'bg'],
  ['boros', 'rw'],
  ['simic', 'gu'],
  // Shards & wedges
  ['bant', 'gwu'],
  ['esper', 'wub'],
  ['grixis', 'ubr'],
  ['jund', 'brg'],
  ['naya', 'rgw'],
  ['abzan', 'wbg'],
  ['jeskai', 'urw'],
  ['sultai', 'bgu'],
  ['mardu', 'rwb'],
  ['temur', 'gur'],
];

const COLOR_WORDS: Entry[] = [
  ...COLOR_GROUPS.map(([name, letters]) => ({
    pattern: name,
    meaning: `colors ${letters.toUpperCase()}`,
    apply: colors(letters),
  })),
  { pattern: 'white', meaning: 'color W', apply: colors('w') },
  { pattern: 'blue', meaning: 'color U', apply: colors('u') },
  { pattern: 'black', meaning: 'color B', apply: colors('b') },
  { pattern: 'red', meaning: 'color R', apply: colors('r') },
  { pattern: 'green', meaning: 'color G', apply: colors('g') },
  {
    pattern: 'five colou?rs?|5 colou?rs?|wubrg|all colou?rs',
    meaning: 'all five colors',
    apply: colors('wubrg'),
  },
  { pattern: 'colou?rless', meaning: 'colorless', apply: (c) => (c.colorless = true) },
];

const role = (r: Role) => (ctx: Ctx) => ctx.roles.add(r);

const ROLE_WORDS: Entry[] = [
  {
    pattern: 'payoffs?|matters|(that )?cares? about|synergy|rewards?',
    meaning: 'payoff (triggers on it)',
    apply: role('payoff'),
  },
  {
    pattern: 'enablers?|effects?|makers?|producers?|generators?|sources?',
    meaning: 'enabler (does it)',
    apply: role('enabler'),
  },
  {
    pattern: 'repeatable|repeated|engines?|recurring|every turn|each turn',
    meaning: 'repeatable (triggered or activated)',
    apply: role('repeatable'),
  },
  { pattern: 'outlets?', meaning: 'outlet (part of an activated cost)', apply: role('outlet') },
  {
    pattern: 'board ?wipes?|wipes?|wraths?|sweepers?|mass removal',
    meaning: 'board wipe',
    apply: role('wipe'),
  },
  {
    pattern: 'removal|remove|kill spells?|kills?|destroy|answers?|interaction',
    meaning: 'removal (targeted)',
    apply: role('removal'),
  },
  { pattern: 'bounce', meaning: 'bounce (return to hand)', apply: role('bounce') },
  {
    pattern: 'counterspells?|counter ?magic|counter spells?',
    meaning: 'counterspell',
    apply: role('counterspell'),
  },
  { pattern: 'ramp|mana acceleration', meaning: 'ramp', apply: role('ramp') },
  {
    pattern: 'mana dorks?',
    meaning: 'ramp creatures',
    apply: (c) => (c.roles.add('ramp'), c.types.add('creature')),
  },
  {
    pattern: 'mana rocks?',
    meaning: 'ramp artifacts',
    apply: (c) => (c.roles.add('ramp'), c.types.add('artifact')),
  },
  { pattern: 'tutors?|tutoring', meaning: 'tutor (search your library)', apply: role('tutor') },
  {
    pattern:
      '(graveyard|grave|yard) ?hate|graveyard (removal|interaction)|exil(e|es|ing) (cards in |cards from )?(the |all |opponents |an opponents )?graveyards?',
    meaning: 'graveyard hate (exiles cards from graveyards)',
    apply: role('graveyard-hate'),
  },
  {
    pattern: 'recursion|recur|reanimat(e|ion|or)|graveyard recursion',
    meaning: 'recursion (from graveyard)',
    apply: role('recursion'),
  },
  {
    pattern: 'protection|protect(ion|ing|ive)? effects?|hexproof|indestructible|shroud|phasing',
    meaning: 'protection (hexproof / indestructible / phasing)',
    apply: role('protection'),
  },
  {
    pattern: '(mana |colou?r )?fixing|fixers?',
    meaning: 'mana fixing (any color)',
    apply: role('fixing'),
  },
  {
    pattern: 'finishers?|win ?cons?|win conditions?|closers?|overruns?',
    meaning: 'finisher (win the game / team pump)',
    apply: role('finisher'),
  },
  { pattern: 'extra turns?|time walks?', meaning: 'extra turns', apply: role('extra-turn') },
  {
    pattern: 'evasion|evasive|unblockable|cant be blocked',
    meaning: "evasion (can't be blocked, flying, trample…)",
    apply: role('evasion'),
  },
  {
    pattern: 'stax|tax(es|ing)?|hatebears?|prison',
    meaning: 'stax / tax effects',
    apply: role('stax'),
  },
  {
    pattern: 'free spells?|free interaction|pitch spells?|free',
    meaning: 'free spells (alternative cost)',
    apply: role('free'),
  },
];

const mech =
  (...ids: string[]) =>
  (ctx: Ctx) =>
    ids.forEach((id) => ctx.mechanics.add(id));

const MECHANIC_WORDS: Entry[] = [
  { pattern: 'scry(ing)?|scries', meaning: 'scry', apply: mech('scry') },
  { pattern: 'surveil(ing|s)?', meaning: 'surveil', apply: mech('surveil') },
  {
    pattern: 'sac(rifice|rificing|rifices|s)?|aristocrats',
    meaning: 'sacrifice',
    apply: mech('sacrifice'),
  },
  {
    // "token creature" / "creature tokens" is about the token, not the card's own type.
    pattern: '(creature |treasure |food |clue |blood )?tokens?( creatures?)?|go wide',
    meaning: 'create tokens',
    apply: mech('create-token'),
  },
  { pattern: '\\+1/\\+1 counters?|counters', meaning: '+1/+1 counters', apply: mech('counter-p1') },
  { pattern: 'life ?gain|gain(ing)? life', meaning: 'gain life', apply: mech('gain-life') },
  {
    pattern: 'drain(ing)?|life ?loss|los(e|ing) life',
    meaning: 'lose life',
    apply: mech('lose-life'),
  },
  { pattern: 'card draw|draw(ing)?( cards?)?', meaning: 'draw', apply: mech('draw') },
  { pattern: 'discard(ing|s)?', meaning: 'discard', apply: mech('discard') },
  { pattern: '(self )?mill(ing)?', meaning: 'mill', apply: mech('mill') },
  { pattern: 'death|dies|dying', meaning: 'dies', apply: mech('dies') },
  {
    pattern: 'etbs?|enters?( the battlefield)?|enter the battlefield',
    meaning: 'enters',
    apply: mech('enters'),
  },
  { pattern: 'attack(s|ing)?', meaning: 'attacks', apply: mech('attacks') },
  {
    pattern: 'spellslinger|casting( spells)?|spells?',
    meaning: 'cast spells',
    apply: mech('cast'),
  },
  { pattern: 'landfall', meaning: 'land enters', apply: mech('land-enters') },
  {
    pattern: 'impulse( draw)?|exile the top',
    meaning: 'exile the top card',
    apply: mech('exile-top'),
  },
  {
    pattern: 'look at the top|top of (my|your|the) library',
    meaning: 'look at the top card',
    apply: mech('look-top'),
  },
  {
    pattern: '(extra|additional) lands?( drops?)?',
    meaning: 'play additional lands',
    apply: mech('extra-land'),
  },
  {
    pattern: 'steal(ing|s)?|theft|threaten',
    meaning: 'steal',
    apply: mech('gain-control', 'cast-opponents'),
  },
  { pattern: 'untap(ping|s)?', meaning: 'untap', apply: mech('untap') },
  { pattern: 'combat damage', meaning: 'combat damage', apply: mech('combat-damage') },
  { pattern: 'damage', meaning: 'deals damage', apply: mech('deals-damage') },
];

const phase = (id: string) => (ctx: Ctx) => ctx.phases.add(id);
/** "every upkeep", "each end step", "at the beginning of your upkeep", "during combat", … */
const WHEN = '((at )?the )?(beginning of |start of )?(every |each |your |during |at |on )*(the )?';

const PHASE_WORDS: Entry[] = [
  { pattern: `${WHEN}upkeeps?`, meaning: 'at the beginning of upkeep', apply: phase('upkeep') },
  {
    pattern: `${WHEN}(end steps?|end of (the |each )?turn|eot)`,
    meaning: 'at the beginning of the end step',
    apply: phase('end-step'),
  },
  { pattern: `${WHEN}draw steps?`, meaning: 'at the beginning of the draw step', apply: phase('draw-step') },
  { pattern: `${WHEN}combat`, meaning: 'at the beginning of combat', apply: phase('combat') },
  {
    pattern: `${WHEN}(pre ?combat |precombat |postcombat )?main phases?`,
    meaning: 'at the beginning of the main phase',
    apply: phase('main'),
  },
];

/** "not …": the following card types or mechanics are excluded (see `parsePhrase`). */
const NEGATION: Entry = {
  pattern: 'but not|and not|not|no|non|without|except( for)?|excluding|exclude|minus|isnt|arent|doesnt|dont|never',
  meaning: 'not …',
  apply: () => undefined,
};

/** "whenever …", "if …": what follows is the trigger condition (see `splitIfThen`). */
const TRIGGER_WORD: Entry = {
  pattern: 'whenever|when|each time|every time|if|after',
  meaning: 'whenever … (trigger)',
  apply: (c) => (c.ifThen = true),
};
/** Separates the trigger condition from what the card then does. */
const THEN = /(?<![a-z])(and then|then|do|,)(?![a-z])/g;

const type = (t: string) => (ctx: Ctx) => ctx.types.add(t);

const TYPE_WORDS: Entry[] = [
  { pattern: 'artifacts?', meaning: 'type artifact', apply: type('artifact') },
  { pattern: 'enchantments?', meaning: 'type enchantment', apply: type('enchantment') },
  { pattern: 'creatures?', meaning: 'type creature', apply: type('creature') },
  { pattern: '(planes)?walkers?', meaning: 'type planeswalker', apply: type('planeswalker') },
  { pattern: 'lands?', meaning: 'type land', apply: type('land') },
  { pattern: 'instants?', meaning: 'type instant', apply: type('instant') },
  { pattern: 'sorcer(y|ies)', meaning: 'type sorcery', apply: type('sorcery') },
  { pattern: 'battles?', meaning: 'type battle', apply: type('battle') },
  {
    pattern: 'permanents?|anything|everything',
    meaning: 'any permanent',
    apply: type('permanent'),
  },
];

const MONEY = '(\\d+(?:\\.\\d+)?) ?(dollars?|bucks|usd|euros?|eur)';
const setPrice = (amount: string, unit: string) => (c: Ctx) => {
  c.priceMax = Number(amount);
  c.currency = /^eu/.test(unit) ? 'eur' : 'usd';
};
const money = (amount: string, unit: string) => (/^eu/.test(unit) ? `€${amount}` : `$${amount}`);

const OTHER_WORDS: Entry[] = [
  {
    pattern: `(under|below|less than|at most|up to|max|cheaper than) ${MONEY}`,
    meaning: (m) => `price ≤ ${money(m[2], m[3])}`,
    apply: (c, m) => setPrice(m[2], m[3])(c),
  },
  {
    pattern: `${MONEY} or (less|under|cheaper|lower)`,
    meaning: (m) => `price ≤ ${money(m[1], m[2])}`,
    apply: (c, m) => setPrice(m[1], m[2])(c),
  },
  {
    pattern: 'budget|inexpensive|affordable',
    meaning: 'budget (price ≤ $5)',
    apply: setPrice('5', 'usd'),
  },
  {
    pattern:
      '(no|without|zero|exclude|excluding|not|non) game ?changers?|no gcs?|bracket [12]|low power|casual',
    meaning: 'no Game Changers (brackets 1–2)',
    apply: (c) => (c.gameChangers = 'exclude'),
  },
  {
    pattern: 'game ?changers?',
    meaning: 'only Game Changers',
    apply: (c) => (c.gameChangers = 'only'),
  },
  {
    // Scryfall can't filter on popularity, but it can sort by it: the staples come first.
    pattern: 'staples?|popular|most played|best|goto|go to|auto ?includes?',
    meaning: 'staples (most played on EDHREC first)',
    apply: (c) => (c.staples = true),
  },
  {
    pattern: 'commanders|as (a |my )?commander|legendary creatures?',
    meaning: 'can be a commander',
    apply: (c) => (c.isCommander = true),
  },
  { pattern: 'commander|edh', meaning: 'format commander', apply: (c) => (c.format = 'commander') },
  {
    pattern: 'pauper|modern|standard|legacy|vintage|brawl|oathbreaker|pioneer',
    meaning: (m) => `format ${m[0]}`,
    apply: (c, m) => (c.format = m[0]),
  },
  { pattern: 'cheap', meaning: 'mana value ≤ 2', apply: (c) => (c.mvMax = 2) },
  {
    pattern: '(under|below|less than) (\\d+)( mana| cmc| mv)?',
    meaning: (m) => `mana value < ${m[2]}`,
    apply: (c, m) => (c.mvMax = Number(m[2]) - 1),
  },
  {
    pattern:
      '(\\d+)( mana| cmc| mv)? or (less|fewer|under|lower)|(at most|up to|max) (\\d+)( mana| cmc| mv)?',
    meaning: (m) => `mana value ≤ ${m[1] ?? m[5]}`,
    apply: (c, m) => (c.mvMax = Number(m[1] ?? m[5])),
  },
  {
    pattern: '(over|above|more than) (\\d+)( mana| cmc| mv)?',
    meaning: (m) => `mana value > ${m[2]}`,
    apply: (c, m) => (c.mvMin = Number(m[2]) + 1),
  },
  {
    pattern: '(\\d+)( mana| cmc| mv)? or (more|higher|greater)|(at least) (\\d+)( mana| cmc| mv)?',
    meaning: (m) => `mana value ≥ ${m[1] ?? m[5]}`,
    apply: (c, m) => (c.mvMin = Number(m[1] ?? m[5])),
  },
  {
    pattern: '(\\d+) (mana|cmc|mv|drops?)',
    meaning: (m) => `mana value = ${m[1]}`,
    apply: (c, m) => (c.mvMin = c.mvMax = Number(m[1])),
  },
];

const ALL_ENTRIES = [
  ...COLOR_WORDS,
  ...ROLE_WORDS,
  ...MECHANIC_WORDS,
  ...PHASE_WORDS,
  TRIGGER_WORD,
  NEGATION,
  ...TYPE_WORDS,
  ...OTHER_WORDS,
];

/** Filler words that are fine to ignore (not reported as "not understood"). */
const STOPWORDS = new Set(
  `i im i'm want wanna need to have find me some cards card that which in for with and or the a an my deck decks
  give show looking look colors color colours colour good list of are is do can please search get all any also
  like stuff things mono only both either triggers trigger abilities ability on from into by it them you your what
  would something there build building using use playing play run running other more great nice new ones one
  let lets s let's every each ,
  make makes making create creates creating produce produces producing put puts gets get`.split(/\s+/),
);

// ---------------------------------------------------------------------------------------------
// The gist: words outside the dictionary that still say something about the card

interface GistWord {
  /** The word as typed. */
  word: string;
  kind: 'text' | 'tribe';
  /** Text: a regex fragment for the rules text. Tribe: the creature type. */
  value: string;
  label: string;
}

/**
 * Words that show up in rules text. A leftover word (after stemming: "exiles" → "exile")
 * that is in here becomes a rules-text search, so long sentences still get their gist:
 * "cards that exile cards in graveyards" → exile + graveyard in one ability.
 */
const TEXT_WORDS: Record<string, string> = {
  exile: 'exile',
  return: 'return',
  destroy: 'destroy',
  reveal: 'reveal',
  tap: '(^|[^n])tap',
  block: 'block',
  choose: 'choose',
  vote: 'vote',
  graveyard: 'graveyard',
  library: 'library',
  hand: 'hand',
  opponent: 'opponent',
  copy: 'cop(y|ies)',
  double: 'double',
  power: 'power',
  toughness: 'toughness',
  flying: 'flying',
  haste: 'haste',
  trample: 'trample',
  lifelink: 'lifelink',
  deathtouch: 'deathtouch',
  vigilance: 'vigilance',
  menace: 'menace',
  flash: 'flash',
  ward: 'ward',
  fight: 'fights?',
  goad: 'goad',
  monarch: 'monarch',
  initiative: 'initiative',
  proliferate: 'proliferate',
  energy: 'energy|\\{e\\}',
  poison: 'poison',
  infect: 'infect|toxic',
  cascade: 'cascade',
  storm: 'storm',
  convoke: 'convoke',
  flashback: 'flashback',
  cycle: 'cycl',
  cycling: 'cycl',
  dredge: 'dredge',
  kicker: 'kick',
  equipment: 'equip',
  equip: 'equip',
  aura: 'aura',
  vehicle: 'vehicle',
  crew: 'crew',
  treasure: 'treasure',
  food: 'food',
  clue: 'clue',
  investigate: 'investigate',
  shuffle: 'shuffle',
  transform: 'transform',
  coin: 'coin',
  dice: 'roll',
  dungeon: 'dungeon|venture',
  venture: 'venture',
  blink: 'exile [^.]*return',
  flicker: 'exile [^.]*return',
  loot: 'draw[^.]*discard',
  rummage: 'discard[^.]*draw',
  wheel: 'discards? (their|your|his or her) hand',
  mutate: 'mutate',
  ninjutsu: 'ninjutsu',
  unearth: 'unearth',
  madness: 'madness',
  delirium: 'delirium',
  threshold: 'threshold',
  morph: 'morph',
  foretell: 'foretell',
  adventure: 'adventure',
  saga: 'saga|lore counter',
  discover: 'discover',
  connive: 'connive',
  explore: 'explore',
  amass: 'amass',
  populate: 'populate',
  manifest: 'manifest',
  sacrifice: 'sacrifice',
  counter: 'counter',
  emblem: 'emblem',
  copies: 'cop(y|ies)',
};

/** Creature types: "elves", "zombies" → `t:elf`, `t:zombie`. */
const TRIBES = new Set(
  `elf goblin zombie vampire dragon angel demon merfolk wizard knight soldier human spirit sliver
  dinosaur cat dog squirrel rat faerie pirate warrior cleric rogue elemental beast hydra ninja samurai
  dwarf wolf werewolf horror eldrazi giant snake bird insect spider treefolk phyrexian artificer druid
  shaman assassin myr thopter servo bat frog otter rabbit mouse hound kithkin construct golem saproling
  devil imp minotaur centaur angel avatar god kraken leviathan octopus serpent shark fish whale`.split(/\s+/),
);
const TRIBE_ALIASES: Record<string, string> = { fairy: 'faerie', fairies: 'faerie', mice: 'mouse', dice: 'dice' };

/** Plausible dictionary forms of a word: "exiles" → exile, "elves" → elf, "copies" → copy. */
function stems(word: string): string[] {
  return [
    word,
    TRIBE_ALIASES[word] ?? '',
    word.replace(/ies$/, 'y'),
    word.replace(/ves$/, 'f'),
    word.replace(/es$/, ''),
    word.replace(/s$/, ''),
    word.replace(/ing$/, ''),
    word.replace(/ing$/, 'e'),
    word.replace(/ed$/, ''),
    word.replace(/d$/, ''),
  ].filter(Boolean);
}

/** The gist of a leftover word, if it is a rules-text word or a creature type. */
function gistOf(word: string, next: string | undefined): GistWord | null {
  for (const stem of stems(word)) {
    if (TRIBES.has(stem)) {
      // "soldier tokens": the token's type, so look for it in the text instead.
      if (next?.startsWith('token')) return { word, kind: 'text', value: stem, label: stem };
      return { word, kind: 'tribe', value: stem, label: stem };
    }
    if (TEXT_WORDS[stem]) return { word, kind: 'text', value: TEXT_WORDS[stem], label: stem };
  }
  return null;
}

/**
 * Words offered as "did you mean …?" for typos. Every word here must be understood on its own
 * (a test checks this), so clicking a suggestion always helps.
 */
export const SUGGESTION_WORDS = [
  ...COLOR_GROUPS.map(([name]) => name),
  ...'white blue black red green colorless'.split(' '),
  ...`payoffs enablers repeatable engines outlets removal wipes wrath sweepers bounce counterspells ramp
  tutors recursion reanimation protection hexproof indestructible fixing finishers wincons evasion
  unblockable stax hatebears scry surveil sacrifice aristocrats tokens counters lifegain drain draw
  discard mill dies enters attacks spellslinger landfall impulse steal theft untap damage artifacts
  enchantments creatures planeswalkers lands instants sorceries battles permanents commanders
  commander staples popular budget casual cheap`.split(/\s+/),
  ...Object.keys(TEXT_WORDS).filter((w) => w.length >= 6 && !/^(copies|cycle)$/.test(w)),
];

/** Damerau–Levenshtein distance (with adjacent swaps), for typo suggestions. */
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** The closest known word, if it is close enough to be a likely typo. */
export function suggest(word: string): string | null {
  if (word.length < 3 || /\d/.test(word)) return null;
  const allowed = word.length <= 5 ? 1 : 2;
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const candidate of SUGGESTION_WORDS) {
    if (Math.abs(candidate.length - word.length) > allowed) continue;
    const dist = editDistance(word, candidate);
    if (dist <= allowed && dist < bestDistance) {
      best = candidate;
      bestDistance = dist;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// Parsing

export interface Recognized {
  text: string;
  meaning: string;
}

export interface ParseResult {
  state: BuilderState;
  recognized: Recognized[];
  /** Words that were not understood and not filler. */
  unknown: string[];
  /** Likely typos among the unknown words, with the word we think was meant. */
  suggestions: { word: string; suggestion: string }[];
  /** Deck-wide filters the phrase itself set (the rest come from the filters panel). */
  mentioned: DeckFilter[];
  /** Problems worth telling the user about (e.g. "payoffs" without a mechanic). */
  warnings: string[];
}

type Zone = 'condition' | 'effect';

/**
 * For "whenever X then Y" (or "Y whenever X"): which mechanic/type hits belong to the trigger
 * condition and which to the effect. Without "then"/"," the first mechanic after "whenever"
 * is the condition and later ones are effects. Null when there's no trigger word.
 */
function splitIfThen(text: string, hits: Hit[]): Map<Hit, Zone> | null {
  const trigger = hits.find((h) => h.entry === TRIGGER_WORD);
  if (!trigger) return null;
  const sep = [...text.matchAll(THEN)].find((m) => m.index >= trigger.end);
  const zones = new Map<Hit, Zone>();
  let conditionTaken = false;
  for (const h of hits) {
    if (!MECHANIC_WORDS.includes(h.entry) && !TYPE_WORDS.includes(h.entry)) continue;
    if (h.start < trigger.start) {
      if (MECHANIC_WORDS.includes(h.entry)) zones.set(h, 'effect');
    } else if (sep ? h.start < sep.index : !conditionTaken) {
      zones.set(h, 'condition');
      if (MECHANIC_WORDS.includes(h.entry)) conditionTaken = true;
    } else if (MECHANIC_WORDS.includes(h.entry)) {
      zones.set(h, 'effect');
    }
  }
  return zones;
}

export function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/and\/or/g, ' and ')
    .replace(/[’']/g, '')
    .replace(/\$\s?(\d+(?:[.,]\d+)?)/g, ' $1 dollars ')
    .replace(/€\s?(\d+(?:[.,]\d+)?)/g, ' $1 euros ')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/(?<!\+1)\/(?!\+1)/g, ' ')
    .replace(/[,:;]/g, ' , ')
    .replace(/\bnon-?(?=(land|creature|artifact|enchantment|planeswalker|instant|sorcery|battle|token|permanent)s?\b)/g, 'non ')
    .replace(/[^a-z0-9+/., ]/g, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Hit {
  start: number;
  end: number;
  entry: Entry;
  match: RegExpMatchArray;
}

export function parsePhrase(input: string): ParseResult {
  const text = normalize(input);

  // Find every dictionary hit, then keep the longest non-overlapping ones.
  const hits: Hit[] = [];
  for (const entry of ALL_ENTRIES) {
    const re = new RegExp(`(?<![a-z0-9+/])(?:${entry.pattern})(?![a-z0-9])`, 'g');
    for (const match of text.matchAll(re)) {
      if (match[0].length === 0) continue;
      hits.push({ start: match.index, end: match.index + match[0].length, entry, match });
    }
  }
  hits.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const accepted: Hit[] = [];
  for (const h of hits) {
    if (accepted.every((a) => h.end <= a.start || h.start >= a.end)) accepted.push(h);
  }
  accepted.sort((a, b) => a.start - b.start);

  const ctx: Ctx = {
    colors: new Set(),
    colorless: false,
    roles: new Set(),
    mechanics: new Set(),
    types: new Set(),
    phases: new Set(),
    notTypes: new Set(),
    notMechanics: new Set(),
    ifThen: false,
    conditions: new Set(),
    effects: new Set(),
    format: null,
    isCommander: false,
    mvMin: null,
    mvMax: null,
    staples: false,
    priceMax: null,
    currency: 'usd',
    gameChangers: '',
    gist: [],
  };
  const zones = splitIfThen(text, accepted);
  const recognized: Recognized[] = [];
  // After "not", following types (or mechanics) are excluded until something else comes up:
  // "not lands or creatures" excludes both.
  let negating: 'pending' | 'type' | 'mechanic' | null = null;
  const notWarnings: string[] = [];
  for (const h of accepted) {
    let meaning =
      typeof h.entry.meaning === 'function' ? h.entry.meaning(h.match) : h.entry.meaning;
    if (h.entry === NEGATION) {
      negating = 'pending';
      recognized.push({ text: h.match[0], meaning });
      continue;
    }
    const isType = TYPE_WORDS.includes(h.entry);
    const isMechanic = MECHANIC_WORDS.includes(h.entry);
    if (negating && ((isType && negating !== 'mechanic') || (isMechanic && negating !== 'type'))) {
      const scratch = { ...ctx, types: new Set<string>(), mechanics: new Set<string>() };
      h.entry.apply(scratch, h.match);
      scratch.types.forEach((t) => t !== 'permanent' && ctx.notTypes.add(t));
      scratch.mechanics.forEach((m) => ctx.notMechanics.add(m));
      negating = isType ? 'type' : 'mechanic';
      recognized.push({ text: h.match[0], meaning: `not: ${meaning}` });
      continue;
    }
    if (negating === 'pending') {
      notWarnings.push(`I can only leave out card types and mechanics, so “not ${h.match[0]}” was ignored.`);
      negating = null;
      recognized.push({ text: h.match[0], meaning: '(ignored after “not”)' });
      continue;
    }
    negating = null;
    const zone = zones?.get(h);
    if (zone && MECHANIC_WORDS.includes(h.entry)) {
      // Collect the mechanic ids this entry adds, then file them as condition or effect.
      const scratch = { ...ctx, mechanics: new Set<string>() };
      h.entry.apply(scratch, h.match);
      const target = zone === 'condition' ? ctx.conditions : ctx.effects;
      scratch.mechanics.forEach((m) => target.add(m));
      meaning = `${zone === 'condition' ? 'when' : 'then'}: ${meaning}`;
    } else if (zone === 'condition' && TYPE_WORDS.includes(h.entry)) {
      // "whenever a creature attacks": the creature is part of the trigger, not the card's type.
      meaning = `(part of the trigger)`;
    } else {
      h.entry.apply(ctx, h.match);
    }
    recognized.push({ text: h.match[0], meaning });
  }
  // Separator words ("then", ",") were used, so they're not "unknown".
  const separators = zones ? [...text.matchAll(THEN)].map((m) => m.index) : [];

  const unknown: string[] = [];
  const words = [...text.matchAll(/\S+/g)];
  words.forEach((word, i) => {
    const covered =
      accepted.some((a) => word.index >= a.start && word.index < a.end) || separators.includes(word.index);
    if (covered || STOPWORDS.has(word[0]) || /^\d+$/.test(word[0])) return;
    // Not in the dictionary, but maybe a rules-text word or creature type: keep the gist.
    const gist = gistOf(word[0], words[i + 1]?.[0]);
    if (!gist) {
      unknown.push(word[0]);
      return;
    }
    if (ctx.gist.some((g) => g.value === gist.value)) return;
    ctx.gist.push(gist);
    recognized.push({
      text: word[0],
      meaning: gist.kind === 'tribe' ? `is a ${gist.label}` : `card text mentions “${gist.label}”`,
    });
  });

  const suggestions = unknown.flatMap((word) => {
    const suggestion = suggest(word);
    return suggestion ? [{ word, suggestion }] : [];
  });

  const built = buildState(ctx);
  return { ...built, warnings: [...notWarnings, ...built.warnings], recognized, unknown, suggestions };
}

/**
 * Filters that describe your deck rather than this one search: colors, format, budget,
 * Game Changers, rarity and sort order. A phrase only changes the ones it mentions, so
 * "removal" after picking W/U in the panel still searches W/U.
 */
export const DECK_FILTERS = [
  'colors',
  'colorless',
  'colorField',
  'colorOp',
  'format',
  'priceMax',
  'currency',
  'gameChangers',
  'rarities',
  'order',
] as const satisfies readonly (keyof Filters)[];
export type DeckFilter = (typeof DECK_FILTERS)[number];

/**
 * The parsed phrase on top of the current filters: deck filters the phrase didn't mention
 * are kept, everything else (card text, types, mana value, "is a commander") comes from the phrase.
 */
export function applyPhrase(result: ParseResult, current: Filters): BuilderState {
  const filters: Filters = structuredClone(result.state.filters);
  for (const key of DECK_FILTERS) {
    if (!result.mentioned.includes(key)) (filters as Record<DeckFilter, unknown>)[key] = structuredClone(current[key]);
  }
  return { filters, root: result.state.root };
}

// ---------------------------------------------------------------------------------------------
// Recipes: turning what was recognized into builder nodes

/** Payoffs are phrased differently from enablers: "whenever a token enters", not "whenever you create a token". */
const PAYOFF_CONDITION: Record<string, string> = { 'create-token': 'token' };

const PERMANENT_TYPES = ['artifact', 'enchantment', 'creature', 'planeswalker', 'land', 'battle'];

function plural(t: string): string {
  return t === 'sorcery' ? 'sorceries' : `${t}s`;
}

function buildState(ctx: Ctx): {
  state: BuilderState;
  warnings: string[];
  mentioned: DeckFilter[];
} {
  const warnings: string[] = [];
  const mentioned: DeckFilter[] = [];
  if (ctx.colors.size || ctx.colorless) mentioned.push('colors', 'colorless');
  if (ctx.format) mentioned.push('format');
  if (ctx.staples) mentioned.push('order');
  if (ctx.priceMax !== null) mentioned.push('priceMax', 'currency');
  if (ctx.gameChangers) mentioned.push('gameChangers');
  const filters = defaultFilters();
  filters.colors = [...ctx.colors];
  filters.colorless = ctx.colorless && ctx.colors.size === 0;
  if (ctx.format) filters.format = ctx.format;
  filters.isCommander = ctx.isCommander;
  filters.mvMin = ctx.mvMin;
  filters.mvMax = ctx.mvMax;
  if (ctx.staples) filters.order = 'edhrec';
  filters.notTypes = [...ctx.notTypes];
  filters.priceMax = ctx.priceMax;
  filters.currency = ctx.currency;
  filters.gameChangers = ctx.gameChangers;

  const roles = [...ctx.roles];
  const mechanics = [...ctx.mechanics];
  const targeted = roles.some((r) => TARGETED_ROLES.includes(r));
  const targets = [...ctx.types];
  // Types describe the card itself unless a role says they're what it hits/finds.
  if (!targeted) filters.types = targets.filter((t) => t !== 'permanent');

  const nodes: QueryNode[] = [];
  const mechanicRoles = roles.filter((r) => MECHANIC_ROLES.includes(r));

  if (ctx.ifThen && (ctx.conditions.size || ctx.effects.size)) {
    const conditions = [...ctx.conditions].map((m) => PAYOFF_CONDITION[m] ?? m);
    nodes.push(
      newAbility({ triggers: ['whenever', 'when'], conditions, effects: [...ctx.effects] }),
    );
  }

  const phases = [...ctx.phases];
  // "…every upkeep": a trigger at the beginning of that step, doing the mechanic (if any).
  // This is more specific than "repeatable" / "enabler", so it replaces those.
  const phaseTrigger = phases.length > 0 && !roles.includes('payoff') && !roles.includes('outlet');
  if (phaseTrigger) {
    nodes.push(newAbility({ triggers: ['beginning'], phases, effects: mechanics }));
  }

  if (!phaseTrigger && mechanics.length > 0 && mechanicRoles.length === 0 && !targeted) {
    // Just a mechanic: cards that do it or mention it. "Card draw" has its own, tighter recipe.
    const rest = mechanics.filter((m) => m !== 'draw');
    if (rest.length < mechanics.length) nodes.push(drawNode());
    if (rest.length) nodes.push(newAbility({ abilityKinds: ['anywhere'], effects: rest }));
  }
  if (mechanicRoles.length > 0 && mechanics.length === 0 && !phaseTrigger) {
    warnings.push(`Which mechanic? e.g. "${ROLE_EXAMPLE[mechanicRoles[0]]}".`);
  }

  for (const r of roles) {
    switch (r) {
      case 'payoff':
        if (mechanics.length) {
          const conditions = [...new Set(mechanics.map((m) => PAYOFF_CONDITION[m] ?? m))];
          nodes.push(newAbility({ triggers: ['whenever'], conditions }));
        }
        break;
      case 'enabler':
        if (mechanics.length && !phaseTrigger)
          nodes.push(newAbility({ abilityKinds: ['anywhere'], effects: mechanics }));
        break;
      case 'repeatable':
        if (mechanics.length && !phaseTrigger) {
          nodes.push(
            newAbility({
              abilityKinds: ['triggered', 'activated'],
              triggers: ['whenever', 'beginning'],
              effects: mechanics,
            }),
          );
        }
        break;
      case 'outlet':
        nodes.push(...outletNodes(mechanics));
        break;
      case 'removal':
        nodes.push(removalNode(targets));
        break;
      case 'wipe':
        nodes.push(wipeNode(targets));
        break;
      case 'bounce':
        nodes.push(
          newRaw(
            `o:/return target ([^.]* )?${typeAlt(targets, 'permanent')}[^.]*owner's hand/`,
            `Returns target ${readable(typeAlt(targets, 'permanent'))} to hand`,
          ),
        );
        break;
      case 'counterspell':
        nodes.push(newRaw('o:/counter target ([^.]* )?spell/', 'Counters target spell'));
        break;
      case 'ramp':
        nodes.push(rampNode(!ctx.notTypes.has('land')));
        break;
      case 'tutor':
        nodes.push(tutorNode(targets));
        break;
      case 'recursion':
        nodes.push(recursionNode(targets));
        break;
      case 'protection':
        nodes.push(
          newGroup('or', [
            newRaw(
              'o:/(gains?|have|has) [^.]*(hexproof|indestructible|shroud|protection from)/',
              'Gives hexproof / indestructible / protection',
            ),
            newRaw('o:/phases? out/', 'Phases things out'),
          ]),
        );
        break;
      case 'fixing':
        nodes.push(newRaw('o:/mana of any (one )?(color|type)/', 'Makes mana of any color'));
        break;
      case 'finisher':
        nodes.push(
          newGroup('or', [
            newRaw('o:/win the game/', 'Wins the game'),
            newRaw('o:/creatures you control get \\+[0-9x]/', 'Pumps your whole team (overrun)'),
          ]),
        );
        break;
      case 'extra-turn':
        nodes.push(newRaw('o:/takes? an extra turn/', 'Takes an extra turn'));
        break;
      case 'evasion':
        nodes.push(
          newRaw(
            "o:/(can't be blocked|gains? (flying|trample|menace|shadow|fear|intimidate))/",
            "Can't be blocked / gives flying, trample, menace…",
          ),
        );
        break;
      case 'stax':
        nodes.push(
          newGroup('or', [
            newRaw('o:/(spells|abilities) [^.]*cost [^.]*more/', 'Makes spells or abilities cost more'),
            newRaw("o:/(permanents|creatures|lands|artifacts) [^.]*don't untap during/", "Things don't untap"),
            newRaw("o:/can't cast more than one spell/", 'Limits spells per turn'),
          ]),
        );
        break;
      case 'graveyard-hate':
        nodes.push(
          newRaw(
            'o:/exile (target|all|each|up to|any number of)[^.]*graveyard/',
            'Exiles cards from graveyards',
          ),
        );
        break;
      case 'free':
        nodes.push(
          newRaw("o:/rather than pay this spell's mana cost/", 'Can be cast without paying its mana cost'),
        );
        break;
    }
  }

  const root = newGroup('or', nodes);
  // Everything below must hold as well: the gist words, and "…without sacrifice".
  const required = gistNodes(ctx.gist);
  if (ctx.notMechanics.size) {
    // "…without sacrifice": none of these mechanics anywhere in the text.
    const excluded = newAbility({ abilityKinds: ['anywhere'], effects: [...ctx.notMechanics] });
    excluded.negated = true;
    required.push(excluded);
  }
  if (required.length) {
    return {
      state: { filters, root: newGroup('and', nodes.length ? [root, ...required] : required) },
      warnings,
      mentioned,
    };
  }
  return { state: { filters, root }, warnings, mentioned };
}

/** Turns a regex alternation like `(artifact|enchantment)` into "artifact / enchantment" for labels. */
function readable(alt: string): string {
  return alt
    .replace(/[()]/g, '')
    .split('|')
    .join(' / ');
}

/** `(a|b|c)` of the given types (plus `extra`), or just `extra` when there are none. */
function typeAlt(types: string[], extra: string, pluralize = false): string {
  const list = [...new Set([...types.filter((t) => t !== 'permanent'), extra])].map((t) =>
    pluralize ? plural(t) : t,
  );
  return list.length === 1 ? list[0] : `(${list.join('|')})`;
}

function outletNodes(mechanics: string[]): QueryNode[] {
  const nodes: QueryNode[] = [];
  const rest: string[] = [];
  for (const m of mechanics) {
    // A real outlet costs *another* thing, not the card itself ("Sacrifice ~:" is not an outlet).
    if (m === 'sacrifice')
      nodes.push(
        newRaw(
          'o:/sacrifice (a|an|another|one|two|x) [^:.]*:/',
          'Sacrifice outlet: sacrifice something as a cost',
        ),
      );
    else if (m === 'discard')
      nodes.push(
        newRaw('o:/discard (a|an|one|two|x) [^:.]*:/', 'Discard outlet: discard a card as a cost'),
      );
    else rest.push(m);
  }
  if (rest.length) nodes.push(newAbility({ abilityKinds: ['activated'], conditions: rest }));
  return nodes;
}

function removalNode(targets: string[]): QueryNode {
  const permanentTargets = targets.filter((t) => PERMANENT_TYPES.includes(t) || t === 'permanent');
  // "Destroy target nonland permanent" also answers artifacts, so `permanent` is always included.
  const what = permanentTargets.length ? typeAlt(permanentTargets, 'permanent') : null;
  const nodes: QueryNode[] = [
    newRaw(
      what ? `o:/(destroy|exile) target ([^.]* )?${what}/` : 'o:/(destroy|exile) target/',
      `Destroys or exiles target ${what ? readable(what) : 'thing'}`,
    ),
  ];
  if (permanentTargets.length === 0 || permanentTargets.includes('creature')) {
    nodes.push(
      newRaw(
        'o:/deals [^.]*damage to (any target|target creature)/',
        'Damage to a target creature / any target',
      ),
    );
    nodes.push(newRaw('o:/target creature [^.]*gets -[0-9x]/', 'Target creature gets -X/-X'));
  }
  return nodes.length === 1 ? nodes[0] : newGroup('or', nodes);
}

function wipeNode(targets: string[]): QueryNode {
  const permanentTargets = targets.filter((t) => PERMANENT_TYPES.includes(t) || t === 'permanent');
  const what = typeAlt(
    permanentTargets.length ? permanentTargets : ['creature'],
    'permanent',
    true,
  );
  const nodes: QueryNode[] = [
    newRaw(
      `o:/(destroy|exile) (all|each) ([^.]* )?${what}/`,
      `Destroys or exiles all ${readable(what)}`,
    ),
  ];
  if (permanentTargets.length === 0 || permanentTargets.includes('creature')) {
    nodes.push(newRaw('o:/all (other )?creatures get -/', 'All creatures get -X/-X'));
    nodes.push(newRaw('o:/damage to each (other )?creature/', 'Damage to each creature'));
  }
  return nodes.length === 1 ? nodes[0] : newGroup('or', nodes);
}

function drawNode(): QueryNode {
  return newRaw(
    'o:/draws? (a|two|three|four|five|six|seven|x|that many) cards?|draws? cards equal/',
    'Draws cards',
  );
}

/** `excludeLands`: ramp means non-land cards; skipped when the phrase already says "not lands". */
function rampNode(excludeLands = true): QueryNode {
  const ramp = newGroup('or', [
    newRaw('o:/search your library for [^.]*land/', 'Searches for a land'),
    newRaw('o:/put [^.]*land [^.]*onto the battlefield/', 'Puts a land onto the battlefield'),
    newRaw('o:"{T}: Add"', 'Taps for mana'),
  ]);
  return excludeLands ? newGroup('and', [ramp, newRaw('-t:land', 'Not a land itself')]) : ramp;
}

function tutorNode(targets: string[]): QueryNode {
  const real = targets.filter((t) => t !== 'permanent');
  if (real.length)
    return newRaw(
      `o:/search your library for an? ([^.]* )?${typeAlt(real, real[0])}/`,
      `Searches your library for a ${readable(typeAlt(real, real[0]))}`,
    );
  return newGroup('and', [
    newRaw('o:/search your library for [^.]*card/', 'Searches your library for a card'),
    newRaw('-o:/search your library for [^.]*(land|basic)/', '…but not for lands'),
  ]);
}

function recursionNode(targets: string[]): QueryNode {
  const real = targets.filter((t) => t !== 'permanent');
  const what = real.length ? `${typeAlt(real, real[0])} card` : 'card';
  return newGroup('or', [
    newRaw(
      `o:/return [^.]*${what}[^.]* from your graveyard/`,
      `Returns a ${readable(what)} from your graveyard`,
    ),
    newRaw(
      `o:/put [^.]*${what}[^.]* from (a|your) graveyard onto the battlefield/`,
      `Reanimates a ${readable(what)}`,
    ),
  ]);
}

/**
 * The gist words as searches. Creature types become `t:`; up to three text words must appear
 * in one ability (same line, any order), more than that each on their own.
 */
function gistNodes(gist: GistWord[]): QueryNode[] {
  const nodes: QueryNode[] = gist
    .filter((g) => g.kind === 'tribe')
    .map((g) => newRaw(`t:${g.value}`, `Is a ${g.label}`));
  const text = gist.filter((g) => g.kind === 'text');
  if (text.length === 1) {
    nodes.push(newRaw(`o:/${text[0].value}/`, `Mentions “${text[0].label}”`));
  } else if (text.length <= 3 && text.length > 1) {
    const orders = permutations(text).map((p) => p.map((g) => wrap(g.value)).join('[^\\n]*'));
    nodes.push(
      newRaw(`o:/${orders.join('|')}/`, `Mentions ${text.map((g) => `“${g.label}”`).join(' and ')} in one ability`),
    );
  } else {
    nodes.push(...text.map((g) => newRaw(`o:/${g.value}/`, `Mentions “${g.label}”`)));
  }
  return nodes;
}

/** A fragment with a top-level `|` needs parentheses before it can be chained. */
function wrap(fragment: string): string {
  let depth = 0;
  for (const ch of fragment) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === '|' && depth === 0) return `(${fragment})`;
  }
  return fragment;
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}
