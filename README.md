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

It shows what it understood and which words it didn't. To teach it new words or recipes, edit
`web/src/app/query/natural.ts` (word lists at the top, recipes at the bottom).

## Run it

```bash
cd api && npm run start:dev    # NestJS on :3000 (saved queries)
cd web && npm start            # Angular on :4200, proxies /api to :3000
```

Open http://localhost:4200.

## Layout

| Path | What |
|---|---|
| `web/src/app/query/vocabulary.ts` | Every clickable term and the regex it maps to. **Add mechanics here.** |
| `web/src/app/query/compiler.ts` | Turns the builder model into a Scryfall query string (+ plain-English explanation). |
| `web/src/app/query/compiler.spec.ts` | Tests for the compiler (`cd web && npx ng test`). |
| `web/src/app/query/templates.ts` | Ready-made starting queries. |
| `web/src/app/components/` | UI: filters, ability editor, groups, saved queries. |
| `api/src/queries/` | Saved queries API, stored in `api/data/queries.json`. |

## Scryfall regex gotchas

- Scryfall rejects a regex nested **more than 2 parentheses deep** and then *silently ignores that term*,
  which makes a query look like it works while it actually matches far too much. The compiler splits
  deep regexes into several `o:/…/` terms automatically; vocabulary patterns may use at most one level.
- Regex is case-insensitive, `~` stands for the card's own name, and `/` must be escaped as `\/`.
- `o:` excludes reminder text (so "look at the top card" won't match every surveil card).
