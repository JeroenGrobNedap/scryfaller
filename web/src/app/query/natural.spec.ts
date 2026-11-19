import { compileQuery, explainNode } from './compiler';
import { SUGGESTION_WORDS, applyPhrase, normalize, parsePhrase, suggest } from './natural';

const query = (phrase: string) => compileQuery(parsePhrase(phrase).state);

describe('parsePhrase — the phrases from the brief', () => {
  it('surveil payoffs in azorius', () => {
    const r = parsePhrase('i want to have surveil payoffs in azorius');
    expect(compileQuery(r.state)).toBe('id<=wu f:commander o:/whenever[^,]*surveil/');
    expect(r.unknown).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('artifact and/or enchantment removal in black', () => {
    expect(query('i need artifact and/or enchantment removal in black')).toBe(
      'id<=b f:commander o:/(destroy|exile) target ([^.]* )?(artifact|enchantment|permanent)/',
    );
  });

  it('sacrifice outlets in boros', () => {
    expect(query('i want sacrifice outlets in boros')).toBe(
      'id<=wr f:commander o:/sacrifice (a|an|another|one|two|x) [^:.]*:/',
    );
  });
});

describe('parsePhrase — more phrases', () => {
  it('repeatable scry or surveil triggers in esper', () => {
    expect(query('Repeatable scry or surveil triggers in Esper')).toBe(
      'id<=wub f:commander (o:/(whenever|at the beginning of)[^,]*,[^.]*(scr[yi]|surveil)/ or o:/:[^.]*(scr[yi]|surveil)/)',
    );
  });

  it('cheap creature removal in rakdos (types are targets, not the card type)', () => {
    expect(query('cheap creature removal in rakdos')).toBe(
      'id<=br f:commander mv<=2 (o:/(destroy|exile) target ([^.]* )?(creature|permanent)/' +
        ' or o:/deals [^.]*damage to (any target|target creature)/ or o:/target creature [^.]*gets -[0-9x]/)',
    );
  });

  it('sultai mana dorks', () => {
    expect(query('sultai mana dorks')).toBe(
      'id<=ubg f:commander t:creature (o:/search your library for [^.]*land/' +
        ' or o:/put [^.]*land [^.]*onto the battlefield/ or o:"{T}: Add") -t:land',
    );
  });

  it('+1/+1 counter payoffs under 4 mana', () => {
    expect(query('+1/+1 counters payoffs under 4 mana')).toBe('f:commander mv<=3 o:/whenever[^,]*\\+1\\/\\+1 counter/');
  });

  it('board wipes that hit artifacts', () => {
    expect(query('artifact board wipes')).toBe('f:commander o:/(destroy|exile) (all|each) ([^.]* )?(artifacts|permanents)/');
  });

  it('a mechanic without a role finds cards that mention it', () => {
    expect(query('landfall in gruul')).toBe('id<=rg f:commander o:/lands? [^,.]*enters/');
  });

  it('commanders that care about tokens', () => {
    expect(query('selesnya commanders that care about tokens')).toBe(
      'id<=wg f:commander is:commander o:/whenever[^,]*tokens?/',
    );
  });
});

describe('parsePhrase — feedback', () => {
  it('reports words it did not understand and roles missing a mechanic', () => {
    const r = parsePhrase('value engines in simic');
    expect(r.unknown).toEqual(['value']);
    expect(r.warnings.length).toBe(1);
    expect(r.recognized.map((x) => x.text)).toEqual(['engines', 'simic']);
  });

  it('prefers the longest phrase (counter spells is not +1/+1 counters)', () => {
    const r = parsePhrase('counter spells in izzet');
    expect(r.recognized.map((x) => x.meaning)).toEqual(['counterspell', 'colors UR']);
  });

  it('gives recipe blocks readable explanations', () => {
    const r = parsePhrase('artifact creature recursion');
    expect(explainNode(r.state.root)).toEqual([
      'ANY of:',
      '  Returns a artifact / creature card from your graveyard',
      '  Reanimates a artifact / creature card',
    ]);
  });

  it('normalizes punctuation and and/or', () => {
    expect(normalize("Artifact/Enchantment and/or +1/+1, mono-black!")).toBe(
      'artifact enchantment and +1/+1 mono black',
    );
  });
});

describe('parsePhrase — staples', () => {
  it('card draw staples in esper', () => {
    const r = parsePhrase('give me card draw staples in esper');
    expect(compileQuery(r.state)).toBe(
      'id<=wub f:commander o:/draws? (a|two|three|four|five|six|seven|x|that many) cards?|draws? cards equal/ order:edhrec',
    );
    expect(r.unknown).toEqual([]);
  });

  it('removal staples in gruul', () => {
    const q = query('give me removal staples in gruul');
    expect(q).toMatch(/^id<=rg f:commander .*o:\/\(destroy\|exile\) target\/.* order:edhrec$/);
  });

  it('recursion staples in black', () => {
    const q = query('give me recursion staples in black');
    expect(q).toMatch(/^id<=b f:commander .*from your graveyard.* order:edhrec$/);
  });

  it('staples on their own just sorts by popularity', () => {
    expect(query('best cards in azorius')).toBe('id<=wu f:commander order:edhrec');
  });

  it('card draw payoffs still mean "whenever you draw"', () => {
    expect(query('card draw payoffs in blue')).toBe('id<=u f:commander o:/whenever[^,]*draw/');
  });
});

describe('parsePhrase — price and Game Changers', () => {
  it('reads dollar amounts as a price cap, not mana value', () => {
    expect(query('removal staples in gruul under $2')).toMatch(/^id<=rg f:commander .* usd<=2 order:edhrec$/);
    expect(query('ramp in green 1.50 dollars or less')).toContain('usd<=1.5');
    expect(query('counterspells under 3 euros')).toContain('eur<=3');
  });

  it('keeps "under 4" as mana value', () => {
    expect(query('counterspells under 4')).toContain('mv<=3');
  });

  it('budget means at most $5', () => {
    expect(query('budget tutors in black')).toContain('usd<=5');
  });

  it('can exclude or require Game Changers', () => {
    expect(query('protection in white without game changers')).toContain('-is:gamechanger');
    expect(query('game changers in blue')).toBe('id<=u f:commander is:gamechanger');
  });
});

describe('parsePhrase — new roles', () => {
  const cases: [string, string][] = [
    ['protection in white', 'protection from'],
    ['mana fixing in jund', 'mana of any'],
    ['finishers in green', 'win the game'],
    ['extra turns in blue', 'extra turn'],
    ['evasion in dimir', "can't be blocked"],
    ['stax pieces in white', 'cost [^.]*more'],
    ['free spells in blue', "rather than pay this spell's mana cost"],
  ];
  for (const [phrase, fragment] of cases) {
    it(phrase, () => {
      const r = parsePhrase(phrase);
      expect(compileQuery(r.state)).toContain(fragment);
      expect(r.warnings).toEqual([]);
    });
  }
});

describe('typo suggestions', () => {
  it('suggests the closest known word', () => {
    const r = parsePhrase('survail payoffs in azorious');
    expect(r.suggestions).toEqual([
      { word: 'survail', suggestion: 'surveil' },
      { word: 'azorious', suggestion: 'azorius' },
    ]);
  });

  it('does not suggest for words that are far off', () => {
    expect(suggest('banana')).toBeNull();
    expect(suggest('xyz')).toBeNull();
  });

  it('only suggests words the parser understands', () => {
    for (const word of SUGGESTION_WORDS) {
      expect(parsePhrase(word).recognized.length).withContext(word).toBeGreaterThan(0);
    }
  });
});

describe('applyPhrase — keeps your filters', () => {
  const mine = () => {
    const f = parsePhrase('azorius').state.filters;
    f.format = 'brawl';
    f.gameChangers = 'exclude';
    f.priceMax = 3;
    f.rarities = ['common'];
    f.types = ['land'];
    f.isCommander = true;
    return f;
  };

  it('keeps colors, format, Game Changers, price and rarity the phrase does not mention', () => {
    const state = applyPhrase(parsePhrase('removal'), mine());
    expect(compileQuery(state)).toBe(
      'id<=wu f:brawl -is:gamechanger (o:/(destroy|exile) target/ or o:/deals [^.]*damage to (any target|target creature)/ or o:/target creature [^.]*gets -[0-9x]/) r:common usd<=3',
    );
  });

  it('lets the phrase override what it does mention', () => {
    const state = applyPhrase(parsePhrase('counterspells in dimir under $1 for commander'), mine());
    expect(state.filters.colors).toEqual(['u', 'b']);
    expect(state.filters.format).toBe('commander');
    expect(state.filters.priceMax).toBe(1);
    expect(state.filters.gameChangers).toBe('exclude');
  });

  it('resets per-search filters (types, mana value, is a commander) to what the phrase says', () => {
    const state = applyPhrase(parsePhrase('card draw'), mine());
    expect(state.filters.types).toEqual([]);
    expect(state.filters.isCommander).toBeFalse();
  });

  it('does not share arrays with the current filters', () => {
    const current = mine();
    const state = applyPhrase(parsePhrase('removal'), current);
    state.filters.colors.push('g');
    expect(current.colors).toEqual(['w', 'u']);
  });
});

describe('parsePhrase — steps like "every upkeep"', () => {
  it('enchantments, artifacts or creatures that every upkeep make a token creature', () => {
    const r = parsePhrase('give me enchantments, artifacts or creatures that every upkeep make a token creature');
    expect(r.unknown).toEqual([]);
    expect(r.state.filters.types).toEqual(['enchantment', 'artifact', 'creature']);
    expect(compileQuery(r.state)).toBe(
      'f:commander (t:enchantment or t:artifact or t:creature) o:/at the beginning of[^,]*upkeep[^,]*,[^.]*creates? [^.]*token/',
    );
  });

  it('understands other ways to say it', () => {
    for (const phrase of [
      'cards that make tokens at the beginning of your upkeep',
      'token makers each upkeep',
      'repeatable tokens every upkeep',
    ]) {
      expect(query(phrase)).withContext(phrase).toContain('o:/at the beginning of[^,]*upkeep[^,]*,[^.]*creates? [^.]*token/');
    }
  });

  it('knows end step, combat and draw step', () => {
    expect(query('draw a card at the end step')).toContain('end step');
    expect(query('scry at the beginning of combat')).toContain('combat');
    expect(query('surveil each draw step')).toContain('draw step');
  });

  it('a step alone finds anything that triggers then', () => {
    expect(query('upkeep triggers in black')).toBe('id<=b f:commander o:/at the beginning of[^,]*upkeep/');
  });

  it('still reads "combat damage" as the mechanic', () => {
    expect(query('combat damage payoffs')).toContain('combat damage');
    expect(query('combat damage payoffs')).not.toContain('at the beginning of');
  });
});
