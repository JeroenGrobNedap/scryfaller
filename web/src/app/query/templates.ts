import { BuilderState, defaultFilters, newAbility, newGroup, newText } from './model';

export interface Template {
  name: string;
  description: string;
  build: () => BuilderState;
}

/** Ready-made starting points. Loading one replaces the current builder state. */
export const TEMPLATES: Template[] = [
  {
    name: 'Scry / surveil payoffs (W/U)',
    description: 'Cards that trigger whenever you scry or surveil.',
    build: () => ({
      filters: { ...defaultFilters(), colors: ['w', 'u'] },
      root: newGroup('and', [
        newAbility({ triggers: ['whenever'], who: ['you'], conditions: ['scry', 'surveil'] }),
      ]),
    }),
  },
  {
    name: 'Repeatable scry / surveil (W/U)',
    description: 'Triggered or activated abilities that scry or surveil, so not one-shot spells.',
    build: () => ({
      filters: { ...defaultFilters(), colors: ['w', 'u'] },
      root: newGroup('and', [
        newAbility({
          abilityKinds: ['triggered', 'activated'],
          triggers: ['whenever', 'beginning'],
          effects: ['scry', 'surveil'],
        }),
      ]),
    }),
  },
  {
    name: 'Sacrifice payoffs',
    description: 'Whenever you sacrifice something, or a creature you control dies.',
    build: () => ({
      filters: defaultFilters(),
      root: newGroup('or', [
        newAbility({ triggers: ['whenever'], who: ['you'], conditions: ['sacrifice'] }),
        newAbility({ triggers: ['whenever'], who: ['creature-you-control', 'another-creature'], conditions: ['dies'] }),
      ]),
    }),
  },
  {
    name: 'Repeatable impulse draw',
    description: 'Repeatedly exile the top card of your library (to play it).',
    build: () => ({
      filters: { ...defaultFilters(), colors: ['r'] },
      root: newGroup('and', [
        newAbility({
          abilityKinds: ['triggered', 'activated'],
          triggers: ['whenever', 'beginning'],
          effects: ['exile-top'],
        }),
      ]),
    }),
  },
  {
    name: 'Extra land drops',
    description: 'Play additional lands, excluding cards that only do it once.',
    build: () => ({
      filters: { ...defaultFilters(), colors: ['g'] },
      root: newGroup('and', [
        newAbility({ abilityKinds: ['anywhere'], effects: ['extra-land'] }),
        { ...newText('this turn'), negated: true },
      ]),
    }),
  },
  {
    name: 'Theft',
    description: "Gain control of opponents' things or cast their cards.",
    build: () => ({
      filters: defaultFilters(),
      root: newGroup('and', [newAbility({ abilityKinds: ['anywhere'], effects: ['gain-control', 'cast-opponents'] })]),
    }),
  },
];
