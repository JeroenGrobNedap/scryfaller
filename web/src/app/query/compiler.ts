import { AbilityClause, BuilderState, Filters, Group, QueryNode, TriggerWord } from './model';
import { ACTIONS, PHASES, Term, TRIGGERS, WHO, findTerm } from './vocabulary';

/**
 * A compiled piece of query text plus its shape, so parents know when to add parentheses.
 * `atom` = one term, `and` = space-separated terms, `or` = terms joined by ` or `.
 */
export interface Compiled {
  text: string;
  shape: 'atom' | 'and' | 'or';
}

const EMPTY: Compiled = { text: '', shape: 'atom' };
const COLOR_ORDER = 'wubrg';

export function compileQuery(state: BuilderState): string {
  const parts = compileFilters(state.filters);
  const tree = compileNode(state.root);
  if (tree.text) {
    parts.splice(filterInsertIndex(parts), 0, tree.shape === 'or' && parts.length > 0 ? `(${tree.text})` : tree.text);
  }
  return parts.join(' ');
}

export function scryfallUrl(query: string): string {
  return `https://scryfall.com/search?q=${encodeURIComponent(query)}`;
}

/** The tree goes after the type/format/color filters but before rarity and sort order. */
function filterInsertIndex(parts: string[]): number {
  const idx = parts.findIndex((p) => p.startsWith('r:') || p.startsWith('(r:') || p.startsWith('order:'));
  return idx === -1 ? parts.length : idx;
}

export function compileFilters(f: Filters): string[] {
  const parts: string[] = [];
  const field = f.colorField === 'identity' ? 'id' : 'c';
  if (f.colorless) {
    parts.push(`${field}=c`);
  } else if (f.colors.length > 0) {
    const letters = [...COLOR_ORDER].filter((c) => f.colors.includes(c as never)).join('');
    parts.push(`${field}${f.colorOp}${letters}`);
  }
  if (f.format) parts.push(`f:${f.format}`);
  if (f.isCommander) parts.push('is:commander');
  if (f.types.length > 0) parts.push(orList(f.types.map((t) => `t:${t}`)));
  if (f.mvMin !== null && f.mvMin === f.mvMax) {
    parts.push(`mv=${f.mvMin}`);
  } else {
    if (f.mvMin !== null) parts.push(`mv>=${f.mvMin}`);
    if (f.mvMax !== null) parts.push(`mv<=${f.mvMax}`);
  }
  if (f.rarities.length > 0) parts.push(orList(f.rarities.map((r) => `r:${r}`)));
  if (f.order) parts.push(`order:${f.order}`);
  return parts;
}

function orList(items: string[]): string {
  return items.length === 1 ? items[0] : `(${items.join(' or ')})`;
}

export function compileNode(node: QueryNode): Compiled {
  switch (node.kind) {
    case 'group':
      return compileGroup(node);
    case 'ability':
      return compileAbility(node);
    case 'text': {
      const text = node.text.trim();
      if (!text) return EMPTY;
      return negate({ text: `o:"${text.replace(/"/g, '\\"')}"`, shape: 'atom' }, node.negated);
    }
    case 'raw': {
      const text = node.text.trim();
      if (!text) return EMPTY;
      return negate({ text, shape: rawShape(text) }, node.negated);
    }
  }
}

function rawShape(text: string): Compiled['shape'] {
  // Spaces inside /regex/ or "quotes" don't separate terms.
  const outer = text.replace(/\/(?:\\.|[^/\\])*\//g, 'R').replace(/"(?:\\.|[^"\\])*"/g, 'Q');
  if (/^-?\(.*\)$/.test(outer) || !/\s/.test(outer)) return 'atom';
  return /\sor\s/i.test(outer) ? 'or' : 'and';
}

function compileGroup(group: Group): Compiled {
  const parts = group.children.map(compileNode).filter((c) => c.text);
  if (parts.length === 0) return EMPTY;
  if (parts.length === 1) return negate(parts[0], group.negated);
  const texts = parts.map((p) => {
    const needsParens = group.op === 'and' ? p.shape === 'or' : p.shape === 'and';
    return needsParens ? `(${p.text})` : p.text;
  });
  return negate({ text: texts.join(group.op === 'and' ? ' ' : ' or '), shape: group.op }, group.negated);
}

function negate(c: Compiled, negated: boolean): Compiled {
  if (!negated || !c.text) return c;
  return { text: c.shape === 'atom' ? `-${c.text}` : `-(${c.text})`, shape: 'atom' };
}

// ---------------------------------------------------------------------------------------------
// Abilities
//
// Scryfall rejects regexes nested deeper than 2 groups ("Too many nested groups") and then silently
// ignores the term. So ability regexes are built as a small tree and, when the rendered regex would
// be too deep, the outermost alternation is split into separate `o:/.../` terms joined with OR.

/** Max parenthesis nesting Scryfall accepts inside one regex. */
export const MAX_REGEX_DEPTH = 2;

/** Regex tree: a literal string, a sequence, or an alternation. */
type Rx = string | Rx[] | { alt: Rx[] };

function render(r: Rx): string {
  if (typeof r === 'string') return r;
  if (Array.isArray(r)) return r.map(render).join('');
  return r.alt.length === 1 ? render(r.alt[0]) : `(${r.alt.map(render).join('|')})`;
}

/** Splits the outermost multi-option alternation, returning one variant per option (or null). */
function splitOutermost(r: Rx): Rx[] | null {
  if (typeof r === 'string') return null;
  if (!Array.isArray(r)) return r.alt.length > 1 ? r.alt : splitOutermost(r.alt[0]);
  const direct = r.findIndex((c) => typeof c === 'object' && !Array.isArray(c) && c.alt.length > 1);
  if (direct !== -1) {
    return (r[direct] as { alt: Rx[] }).alt.map((opt) => [...r.slice(0, direct), opt, ...r.slice(direct + 1)]);
  }
  for (let i = 0; i < r.length; i++) {
    const variants = splitOutermost(r[i]);
    if (variants) return variants.map((v) => [...r.slice(0, i), v, ...r.slice(i + 1)]);
  }
  return null;
}

/** Renders `r` as one or more regexes that are each shallow enough for Scryfall. */
function fit(r: Rx): string[] {
  const text = render(r);
  if (nestDepth(text) <= MAX_REGEX_DEPTH) return [text];
  const variants = splitOutermost(r);
  return variants ? variants.flatMap(fit) : [text];
}

/** Maximum parenthesis nesting in a regex, ignoring escaped parens and character classes. */
export function nestDepth(regex: string): number {
  let depth = 0;
  let max = 0;
  let inClass = false;
  for (let i = 0; i < regex.length; i++) {
    const ch = regex[i];
    if (ch === '\\') {
      i++;
    } else if (inClass) {
      if (ch === ']') inClass = false;
    } else if (ch === '[') {
      inClass = true;
    } else if (ch === '(') {
      max = Math.max(max, ++depth);
    } else if (ch === ')') {
      depth--;
    }
  }
  return max;
}

/** Alternation of the selected terms, or null when nothing is selected. */
function slot(list: Term[], ids: string[]): Rx | null {
  const patterns = ids.map((id) => findTerm(list, id)?.pattern).filter((p): p is string => !!p);
  return patterns.length > 0 ? { alt: patterns } : null;
}

/** Text between the trigger word and the comma, requiring `a` and `b` in either order. */
function conditionRegion(a: Rx | null, b: Rx | null): Rx {
  if (a && b) return ['[^,]*', { alt: [[a, '[^,]*', b], [b, '[^,]*', a]] }];
  const one = a ?? b;
  return one ? ['[^,]*', one] : [];
}

/** One alternative of an ability: the regexes in `all` must all match (AND). */
interface Branch {
  all: string[][];
}

/**
 * The Scryfall regexes an ability compiles to: a list of branches (OR-ed); each branch is a list
 * of requirements (AND-ed); each requirement is a list of regexes (OR-ed, usually just one).
 */
export function abilityRegexes(a: AbilityClause): Branch[] {
  const who = slot(WHO, a.who);
  const conditions = slot(ACTIONS, a.conditions);
  const phases = slot(PHASES, a.phases);
  const effect = slot(ACTIONS, a.effects);
  const branches: Branch[] = [];
  // Nothing picked yet: don't add a near-meaningless term like o:/whenever/.
  if (!who && !conditions && !phases && !effect) return branches;

  if (a.abilityKinds.includes('triggered')) {
    const triggers: TriggerWord[] = a.triggers.length > 0 ? a.triggers : ['whenever', 'when', 'beginning'];
    // Trigger words needing the same condition region merge into one regex.
    const byRegion = new Map<string, { region: Rx; words: string[] }>();
    for (const t of TRIGGERS) {
      if (!triggers.includes(t.id as TriggerWord)) continue;
      const region = conditionRegion(who, t.id === 'beginning' ? phases : conditions);
      const key = render(region);
      const entry = byRegion.get(key) ?? { region, words: [] };
      entry.words.push(t.pattern);
      byRegion.set(key, entry);
    }
    for (const { region, words } of byRegion.values()) {
      const tail: Rx = effect ? ['[^,]*,[^.]*', effect] : [];
      branches.push({ all: [fit([{ alt: words }, region, tail])] });
    }
  }

  if (a.abilityKinds.includes('activated')) {
    const cost: Rx = conditions ? [conditions, '[^:.]*:'] : ':';
    branches.push({ all: [fit([cost, effect ? ['[^.]*', effect] : []])] });
  }

  if (a.abilityKinds.includes('anywhere')) {
    const all = [who, conditions, phases, effect].filter((s): s is Rx => !!s).map(fit);
    if (all.length > 0) branches.push({ all });
  }

  return branches;
}

const term = (regex: string) => `o:/${regex}/`;

export function compileAbility(a: AbilityClause): Compiled {
  /** Top-level alternatives of this ability (OR-ed). */
  const alternatives: Compiled[] = [];
  for (const branch of abilityRegexes(a)) {
    if (branch.all.length === 1) {
      // A single requirement: each of its regexes is its own alternative.
      alternatives.push(...branch.all[0].map((r) => ({ text: term(r), shape: 'atom' as const })));
    } else {
      const reqs = branch.all.map((rs) => (rs.length === 1 ? term(rs[0]) : `(${rs.map(term).join(' or ')})`));
      alternatives.push({ text: reqs.join(' '), shape: 'and' });
    }
  }

  if (alternatives.length === 0) return EMPTY;
  if (alternatives.length === 1) return negate(alternatives[0], a.negated);
  const text = alternatives.map((c) => (c.shape === 'and' ? `(${c.text})` : c.text)).join(' or ');
  // Several alternatives are always shown in parentheses so the OR stays readable inside an AND.
  return negate({ text: `(${text})`, shape: 'atom' }, a.negated);
}

// ---------------------------------------------------------------------------------------------
// Plain-language explanation

function labels(list: Term[], ids: string[]): string {
  return ids.map((id) => findTerm(list, id)?.label ?? id).join(' or ');
}

const KIND_LABEL = { triggered: 'Triggered', activated: 'Activated', anywhere: 'Anywhere in text' };

export function explainNode(node: QueryNode, depth = 0): string[] {
  const pad = '  '.repeat(depth);
  const not = node.negated ? 'NOT ' : '';
  switch (node.kind) {
    case 'group': {
      const nonEmpty = node.children.filter((c) => explainNode(c).length > 0);
      if (nonEmpty.length === 0) return [];
      if (nonEmpty.length === 1 && !node.negated) return explainNode(nonEmpty[0], depth);
      const children = nonEmpty.flatMap((c) => explainNode(c, depth + 1));
      if (depth === 0 && !node.negated && node.op === 'and') return node.children.flatMap((c) => explainNode(c, 0));
      return [`${pad}${not}${node.op === 'and' ? 'ALL of' : 'ANY of'}:`, ...children];
    }
    case 'text':
      return node.text.trim() ? [`${pad}${not}Text contains "${node.text.trim()}"`] : [];
    case 'raw':
      return node.text.trim() ? [`${pad}${not}${node.label ?? `Raw: ${node.text.trim()}`}`] : [];
    case 'ability': {
      const kinds = node.abilityKinds.map((k) => KIND_LABEL[k]).join(' or ');
      const parts: string[] = [];
      if (node.abilityKinds.includes('triggered')) parts.push(labels(TRIGGERS, node.triggers) || 'any trigger');
      if (node.who.length) parts.push(labels(WHO, node.who));
      if (node.conditions.length) parts.push(labels(ACTIONS, node.conditions));
      if (node.phases.length) parts.push(labels(PHASES, node.phases));
      const effect = node.effects.length ? ` → ${labels(ACTIONS, node.effects)}` : '';
      return [`${pad}${not}${kinds}: ${parts.join(' — ')}${effect}`];
    }
  }
}
