# Scryfaller

Click together advanced [Scryfall](https://scryfall.com) queries, aimed at Commander.

Instead of writing regex by hand, you build card abilities from parts —
**Trigger** (whenever / at the beginning of) · **Who** (you / opponents) · **Condition** · **Step** · **Effect** —
and Scryfaller generates the oracle-text regex for you.

- *Payoff* = the mechanic is in the **condition**: "Whenever **you scry**, …"
- *Repeatable enabler* = the mechanic is in the **effect** of a triggered or activated ability: "At the beginning of your upkeep, **scry 1**" / "{T}: **Surveil 1**"

## Type what you want

The box at the top understands short phrases (rule-based, no AI) and fills in the builder for you:

- `surveil payoffs in azorius` · `sacrifice outlets in boros` · `repeatable scry or surveil in esper`
- `artifact and/or enchantment removal in black` · `cheap creature removal in rakdos` · `artifact board wipes`
- `selesnya commanders that care about tokens` · `sultai mana dorks` · `+1/+1 counter payoffs under 4 mana`
- `card draw staples in esper` · `removal staples in gruul` · `recursion staples in black`

"Staples" (or "best", "popular", "most played") sorts by EDHREC popularity (`order:edhrec`), so the most-played
cards come first. Scryfall can sort by popularity but not filter on it, so the long tail is still there further down.

More it understands:

- **Price:** `under $2`, `3 euros or less`, `budget` (≤ $5). Plain `under 4` still means mana value.
- **Game Changers:** `without game changers` / `bracket 2` / `casual` excludes them; `game changers in blue` shows only them.
- **Roles:** protection, mana fixing, finishers / win cons, extra turns, evasion, stax / tax, free (pitch) spells,
  on top of removal, wipes, bounce, counterspells, ramp, tutors, recursion, payoffs, enablers and outlets.
- **Typos:** misspelled words get a clickable "did you mean …?". Your last 10 searches are listed under the box.

Your deck filters (colors, format, price, Game Changers, rarity, sort) stay as you set them in the panel;
a phrase only changes the ones it mentions, and shows which ones it kept.
It shows what it understood and which words it didn't. To teach it new words or recipes, edit
`web/src/app/query/natural.ts` (word lists at the top, recipes at the bottom).

## Run it

The app is frontend-only: saved queries live in your browser (with Export/Import for backups).
Every push to `main` that touches `web/` is tested, built and deployed to GitHub Pages by
`.github/workflows/pages.yml`.

To work on it locally:

```bash
cd web && npm start            # http://localhost:4200
```

The NestJS app in `api/` is not used right now; it's kept for a future Scryfall integration.

## Layout

| Path | What |
|---|---|
| `web/src/app/query/vocabulary.ts` | Every clickable term and the regex it maps to. **Add mechanics here.** |
| `web/src/app/query/compiler.ts` | Turns the builder model into a Scryfall query string (+ plain-English explanation). |
| `web/src/app/query/compiler.spec.ts` | Tests for the compiler (`cd web && npx ng test`). |
| `web/src/app/query/templates.ts` | Ready-made starting queries. |
| `web/src/app/components/` | UI: phrase search, filters, ability editor, groups, saved queries. |
| `web/src/app/saved-queries.service.ts` | Saved queries in localStorage, plus JSON export/import. |
| `api/` | NestJS app (currently unused). |

## Scryfall regex gotchas

- Scryfall rejects a regex nested **more than 2 parentheses deep** and then *silently ignores that term*,
  which makes a query look like it works while it actually matches far too much. The compiler splits
  deep regexes into several `o:/…/` terms automatically; vocabulary patterns may use at most one level.
- Regex is case-insensitive, `~` stands for the card's own name, and `/` must be escaped as `\/`.
- `o:` excludes reminder text (so "look at the top card" won't match every surveil card).
