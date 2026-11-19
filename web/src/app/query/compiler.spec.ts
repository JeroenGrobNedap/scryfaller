import { MAX_REGEX_DEPTH, abilityRegexes, compileAbility, compileQuery, explainNode, nestDepth, scryfallUrl } from './compiler';
import { ACTIONS, PHASES, TRIGGERS, WHO } from './vocabulary';
import { BuilderState, defaultFilters, newAbility, newGroup, newRaw, newText } from './model';

function state(partial: Partial<BuilderState['filters']>, ...children: BuilderState['root']['children']): BuilderState {
  return { filters: { ...defaultFilters(), ...partial }, root: newGroup('and', children) };
}

const SCRY_OR_SURVEIL = '(scr[yi]|surveil)';

describe('compileQuery — the motivating examples', () => {
  it('finds scry/surveil payoffs in white and/or blue for commander', () => {
    const q = compileQuery(
      state(
        { colors: ['w', 'u'] },
        newAbility({ triggers: ['whenever'], who: ['you'], conditions: ['scry', 'surveil'] }),
      ),
    );
    expect(q).toBe(
      `id<=wu f:commander o:/whenever[^,]*(you[^,]*${SCRY_OR_SURVEIL}|${SCRY_OR_SURVEIL}[^,]*you)/`,
    );
  });

  it('finds repeatable scry/surveil (triggered or activated)', () => {
    const q = compileQuery(
      state(
        { colors: ['w', 'u'] },
        newAbility({
          abilityKinds: ['triggered', 'activated'],
          triggers: ['whenever', 'beginning'],
          effects: ['scry', 'surveil'],
        }),
      ),
    );
    expect(q).toBe(
      `id<=wu f:commander (o:/(whenever|at the beginning of)[^,]*,[^.]*${SCRY_OR_SURVEIL}/ or o:/:[^.]*${SCRY_OR_SURVEIL}/)`,
    );
  });
});

describe('compileAbility', () => {
  it('splits branches when "whenever" and "at the beginning of" have different conditions', () => {
    const q = compileAbility(
      newAbility({ triggers: ['whenever', 'beginning'], conditions: ['scry'], phases: ['upkeep'], effects: ['draw'] }),
    ).text;
    expect(q).toBe(
      '(o:/whenever[^,]*scr[yi][^,]*,[^.]*draw/ or o:/at the beginning of[^,]*upkeep[^,]*,[^.]*draw/)',
    );
  });

  it('matches who and phase in either order for "at the beginning of"', () => {
    const q = compileAbility(newAbility({ triggers: ['beginning'], who: ['opponent'], phases: ['upkeep'] })).text;
    expect(q).toBe('o:/at the beginning of[^,]*(opponent[^,]*upkeep|upkeep[^,]*opponent)/');
  });

  it('treats conditions as the cost of an activated ability', () => {
    const q = compileAbility(
      newAbility({ abilityKinds: ['activated'], conditions: ['sacrifice'], effects: ['draw'] }),
    ).text;
    expect(q).toBe('o:/sacrific[^:.]*:[^.]*draw/');
  });

  it('ANDs separate terms for "anywhere"', () => {
    const q = compileAbility(
      newAbility({ abilityKinds: ['anywhere'], who: ['opponent'], effects: ['gain-control'] }),
    ).text;
    expect(q).toBe('o:/opponent/ o:/gain control of/');
  });

  it('wraps a negated multi-term ability in parentheses', () => {
    const q = compileAbility(
      newAbility({ negated: true, abilityKinds: ['anywhere'], who: ['opponent'], effects: ['gain-control'] }),
    ).text;
    expect(q).toBe('-(o:/opponent/ o:/gain control of/)');
  });

  it('compiles an ability with nothing picked to nothing', () => {
    expect(compileAbility(newAbility({ abilityKinds: ['anywhere'] })).text).toBe('');
    expect(compileAbility(newAbility({ abilityKinds: ['triggered', 'activated'] })).text).toBe('');
  });

  it('escapes the slashes in +1/+1', () => {
    const q = compileAbility(newAbility({ abilityKinds: ['anywhere'], effects: ['counter-p1'] })).text;
    expect(q).toBe('o:/\\+1\\/\\+1 counter/');
  });
});

describe('groups, text and raw clauses', () => {
  it('compiles a negated OR group', () => {
    const g = newGroup('or', [newText('draw a card'), newText('discard')]);
    g.negated = true;
    expect(compileQuery(state({ format: '' }, g))).toBe('-(o:"draw a card" or o:"discard")');
  });

  it('wraps an OR group inside an AND group', () => {
    const q = compileQuery(
      state({ format: '' }, newText('flying'), newGroup('or', [newRaw('t:angel'), newRaw('t:demon')])),
    );
    expect(q).toBe('o:"flying" (t:angel or t:demon)');
  });

  it('wraps an AND group inside an OR group', () => {
    const q = compileQuery(
      state({ format: '' }, newGroup('or', [newGroup('and', [newRaw('t:elf'), newRaw('t:druid')]), newRaw('t:wizard')])),
    );
    expect(q).toBe('(t:elf t:druid) or t:wizard');
  });

  it('escapes quotes in text clauses and skips empty ones', () => {
    const q = compileQuery(state({ format: '' }, newText('say "hi"'), newText('  ')));
    expect(q).toBe('o:"say \\"hi\\""');
  });
});

describe('filters', () => {
  it('compiles every filter', () => {
    const q = compileQuery(
      state({
        colors: ['u', 'w', 'b'],
        colorField: 'color',
        colorOp: '>=',
        isCommander: true,
        types: ['creature', 'enchantment'],
        mvMin: 2,
        mvMax: 4,
        rarities: ['rare'],
        order: 'edhrec',
      }),
    );
    expect(q).toBe('c>=wub f:commander is:commander (t:creature or t:enchantment) mv>=2 mv<=4 r:rare order:edhrec');
  });

  it('handles colorless and an exact mana value', () => {
    expect(compileQuery(state({ colorless: true, mvMin: 3, mvMax: 3 }))).toBe('id=c f:commander mv=3');
  });
});

describe('helpers', () => {
  it('builds a Scryfall search URL', () => {
    expect(scryfallUrl('id<=wu f:commander')).toBe('https://scryfall.com/search?q=id%3C%3Dwu%20f%3Acommander');
  });

  it('explains an ability in plain words', () => {
    const lines = explainNode(
      newAbility({ triggers: ['whenever'], who: ['you'], conditions: ['scry', 'surveil'], effects: ['draw'] }),
    );
    expect(lines).toEqual(['Triggered: Whenever — you — scry or surveil → draw']);
  });
});

describe('Scryfall nesting limit (max 2 levels of parentheses per regex)', () => {
  it('measures nesting while ignoring escapes and character classes', () => {
    expect(nestDepth('abc')).toBe(0);
    expect(nestDepth('(a|(b|c))')).toBe(2);
    expect(nestDepth('\\(a\\)[(]')).toBe(0);
  });

  it('keeps every vocabulary pattern at most 1 level deep', () => {
    for (const t of [...TRIGGERS, ...WHO, ...PHASES, ...ACTIONS]) {
      expect(nestDepth(t.pattern)).withContext(t.id).toBeLessThanOrEqual(1);
    }
  });

  it('splits into several terms instead of exceeding the limit', () => {
    const q = compileAbility(
      newAbility({ triggers: ['whenever'], who: ['you', 'opponent'], conditions: ['cast-opponents', 'scry'] }),
    ).text;
    const cond = "((cast|play)[^.]*(you don't own|opponents? owns?)|scr[yi])";
    expect(q).toBe(
      `(o:/whenever[^,]*(you|opponent)[^,]*${cond}/ or o:/whenever[^,]*${cond}[^,]*(you|opponent)/)`,
    );
  });

  it('never exceeds the limit, even with everything selected', () => {
    const everything = newAbility({
      abilityKinds: ['triggered', 'activated', 'anywhere'],
      triggers: TRIGGERS.map((t) => t.id) as never,
      who: WHO.map((t) => t.id),
      conditions: ACTIONS.map((t) => t.id),
      phases: PHASES.map((t) => t.id),
      effects: ACTIONS.map((t) => t.id),
    });
    const regexes = abilityRegexes(everything).flatMap((b) => b.all.flat());
    expect(regexes.length).toBeGreaterThan(0);
    for (const r of regexes) expect(nestDepth(r)).withContext(r).toBeLessThanOrEqual(MAX_REGEX_DEPTH);
  });
});
