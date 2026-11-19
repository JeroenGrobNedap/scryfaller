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
  | 'free';

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
  format: string | null;
  isCommander: boolean;
  mvMin: number | null;
  mvMax: number | null;
  /** "staples": sort by EDHREC popularity so the most-played cards come first. */
  staples: boolean;
  priceMax: number | null;
  currency: 'usd' | 'eur';
  gameChangers: '' | 'exclude' | 'only';
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
  { pattern: 'tokens?|go wide', meaning: 'create tokens', apply: mech('create-token') },
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
  ...TYPE_WORDS,
  ...OTHER_WORDS,
];

/** Filler words that are fine to ignore (not reported as "not understood"). */
const STOPWORDS = new Set(
  `i im i'm want wanna need to have find me some cards card that which in for with and or the a an my deck decks
  give show looking look colors color colours colour good list of are is do can please search get all any also
  like stuff things mono only both either triggers trigger abilities ability on from into by it them you your what
  would something there build building using use playing play run running other more great nice new ones one
  let lets s let's`.split(/\s+/),
);

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
  /** Problems worth telling the user about (e.g. "payoffs" without a mechanic). */
  warnings: string[];
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
    .replace(/[^a-z0-9+/. ]/g, ' ')
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
    format: null,
    isCommander: false,
    mvMin: null,
    mvMax: null,
    staples: false,
    priceMax: null,
    currency: 'usd',
    gameChangers: '',
  };
  const recognized: Recognized[] = [];
  for (const h of accepted) {
    h.entry.apply(ctx, h.match);
    const meaning =
      typeof h.entry.meaning === 'function' ? h.entry.meaning(h.match) : h.entry.meaning;
    recognized.push({ text: h.match[0], meaning });
  }

  const unknown: string[] = [];
  for (const word of text.matchAll(/\S+/g)) {
    const covered = accepted.some((a) => word.index >= a.start && word.index < a.end);
    if (!covered && !STOPWORDS.has(word[0]) && !/^\d+$/.test(word[0])) unknown.push(word[0]);
  }

  const suggestions = unknown.flatMap((word) => {
    const suggestion = suggest(word);
    return suggestion ? [{ word, suggestion }] : [];
  });

  return { ...buildState(ctx), recognized, unknown, suggestions };
}

// ---------------------------------------------------------------------------------------------
// Recipes: turning what was recognized into builder nodes

/** Payoffs are phrased differently from enablers: "whenever a token enters", not "whenever you create a token". */
const PAYOFF_CONDITION: Record<string, string> = { 'create-token': 'token' };

const PERMANENT_TYPES = ['artifact', 'enchantment', 'creature', 'planeswalker', 'land', 'battle'];

function plural(t: string): string {
  return t === 'sorcery' ? 'sorceries' : `${t}s`;
}

function buildState(ctx: Ctx): { state: BuilderState; warnings: string[] } {
  const warnings: string[] = [];
  const filters = defaultFilters();
  filters.colors = [...ctx.colors];
  filters.colorless = ctx.colorless && ctx.colors.size === 0;
  if (ctx.format) filters.format = ctx.format;
  filters.isCommander = ctx.isCommander;
  filters.mvMin = ctx.mvMin;
  filters.mvMax = ctx.mvMax;
  if (ctx.staples) filters.order = 'edhrec';
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

  if (mechanics.length > 0 && mechanicRoles.length === 0 && !targeted) {
    // Just a mechanic: cards that do it or mention it. "Card draw" has its own, tighter recipe.
    const rest = mechanics.filter((m) => m !== 'draw');
    if (rest.length < mechanics.length) nodes.push(drawNode());
    if (rest.length) nodes.push(newAbility({ abilityKinds: ['anywhere'], effects: rest }));
  }
  if (mechanicRoles.length > 0 && mechanics.length === 0) {
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
        if (mechanics.length)
          nodes.push(newAbility({ abilityKinds: ['anywhere'], effects: mechanics }));
        break;
      case 'repeatable':
        if (mechanics.length) {
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
        nodes.push(rampNode());
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
      case 'free':
        nodes.push(
          newRaw("o:/rather than pay this spell's mana cost/", 'Can be cast without paying its mana cost'),
        );
        break;
    }
  }

  return { state: { filters, root: newGroup('or', nodes) }, warnings };
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

function rampNode(): QueryNode {
  return newGroup('and', [
    newGroup('or', [
      newRaw('o:/search your library for [^.]*land/', 'Searches for a land'),
      newRaw('o:/put [^.]*land [^.]*onto the battlefield/', 'Puts a land onto the battlefield'),
      newRaw('o:"{T}: Add"', 'Taps for mana'),
    ]),
    newRaw('-t:land', 'Not a land itself'),
  ]);
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
