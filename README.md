# Awards Night

Family superlatives and chapter awards for Chickadee Bandit. Adults set up a
ceremony with award categories — "Most likely to lose their keys," "Best chef,"
"Moment of the year" — and every member casts **one secret pick per category**.
Picks stay **sealed until the ceremony**: nobody (not even adults) can see how
others voted while voting is open. When an adult holds the ceremony, every pick
is revealed at once and the winners are tallied.

Pairs naturally with **Wins & Celebrations** and a year-in-review.

---

## How it works

1. **An adult creates a ceremony** and adds award categories. Each category is
   either a **member** award (pick a household member) or a **write-in** (type
   an answer, e.g. the moment of the year).
2. **Everyone casts their picks.** Each member gets one pick per category and a
   line to say why. You can change your pick until the reveal. Your pick — and
   everyone else's — stays hidden.
3. **The reveal.** An adult holds the ceremony. All picks unseal, results are
   tallied per category, ties are shown, and each voter's reason is read out.
4. **Archive** the ceremony to keep it as a locked keepsake.

Each member's pick doubles as both the *nomination* and the *vote* — the winner
of a category is simply the nominee with the most picks.

---

## Data model & security

`storage: "db"` with three tables (all prefixed `app_awards_night__`):

| Table | Row policy | Why |
|---|---|---|
| `ceremonies` | `adult_writable` + `frozen_when` (archived) | Everyone reads; only adults create and move a ceremony through its lifecycle. Archived ceremonies are frozen. |
| `categories` | `adult_writable` | Everyone reads the categories; only adults define them. |
| `ballots` | `sealed_until` (parent `ceremonies`) + `max_per_member` (`category_id`) + `frozen_when` | Each member sees **only their own** pick until the ceremony `status` becomes `revealed`, then all picks are visible. One pick per member per category. Picks freeze once revealed. |

Because `sealed_until` is enforced by the hub before any SQL runs, a member
can't peek at others' picks by calling `/api/db` directly — the seal holds even
against hand-crafted requests. This is the same pattern used by Family Trivia
and sealed HOA bids.

---

## Quick start

```bash
npm install
npm run dev     # preview at http://localhost:3001 (demo data, no hub needed)
npm test        # manifest + tally/lifecycle logic unit tests
npm run build   # produces dist/bundle.json to install in your hub
```

Push to `main` and the included GitHub Actions workflow validates the app
against the hub contract and publishes `dist/bundle.json` as a release asset.

---

## File structure

```
manifest.json                 App metadata, row_policies, publishes, ai_access
migrations/001_init.sql        ceremonies / categories / ballots schema
src/
  index.html                  App entry point (UI + DB calls)
  logic.js                    Pure lifecycle + tally logic (unit-tested)
  shared.js                   isAdult mirror for tests
  queries/
    active_ceremonies.sql     ai_access db_export
    ceremony_categories.sql   ai_access db_export
__tests__/
  manifest.test.mjs
  logic.test.mjs
```
