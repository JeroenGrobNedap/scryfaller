import { compileQuery, explainNode } from './compiler';
import { normalize, parsePhrase } from './natural';

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
