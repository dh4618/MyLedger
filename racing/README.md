# Racecard Research (private proof of concept)

An AI-assisted research tool for UK horse racing. It turns a racecard into a clean, visual
page; it shows the evidence for and against each runner; and it ends with a clear outcome:
an estimated win chance per horse, a ranked order and a plain-English verdict.

**Not a betting product.** No bets, no customer funds, no bet placement. Private, not public,
not charging.

> All runners, trainers and jockeys in `data/racecards/` are **fictional** (set at real courses)
> so the app can be built and tested. Add real races by hand for your own private research; see
> [Adding races](#adding-races).

---

## Run it

```bash
cd racing
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests + validates every racecard file
npm run build      # type-check + production build
```

## Stack

| Choice | Why |
|---|---|
| **React + Vite + TypeScript** | Fast to build, easy to host anywhere as static files. TypeScript matters here because the data model is the core of the app. |
| **Zod** | One schema per data shape, used for the TypeScript types *and* to validate data at runtime: hand-typed racecards now, AI JSON output in step 4. |
| **Plain CSS** with light/dark tokens | No design framework to learn. The chart is hand-built HTML/CSS, so no chart library is needed yet. |
| **Vitest** | Tests the parts that must be right: odds maths, distance formatting, the evidence rules. |
| *(step 4)* a small server route | The AI API key must never reach the browser. One endpoint (a Vercel/Netlify function, or a tiny Node server) calls the model, validates the result and caches it per race. |

## How it fits together

```
data/racecards/*.json ──► src/data/repository.ts ──► pages
   (Meeting→Race→Runner)     validates with Zod         │
                                                        ▼
                          src/lib/facts.ts        evidence chips per runner
                          src/lib/market.ts       odds → fair % (margin removed)
                          src/lib/baseline.ts     RaceAnalysis (today: market + rules)
                                                        │
                       step 4: AI returns the same RaceAnalysis JSON, cached per race
```

The race page only ever renders a **`RaceAnalysis`** (`src/model/analysis.ts`):

```ts
{
  raceId, source: 'baseline' | 'ai', method, generatedAt,
  summary: "An open race: …",
  runners: [{
    runnerId, winChance: 32.5, rank: 1,
    verdict: "Favourite, but unproven on soft ground.",
    factors: [{ factor: 'going', score: -1, evidence: "No runs on soft…" }, …]
  }]
}
```

Today this is filled by a **baseline**: win chance = the betting market's view with the
bookmaker's margin removed, and factors/verdicts from simple rules. So the outcome display
(step 5) is real now, and when the AI arrives it only has to return the same shape. The baseline
also stays useful as the yardstick the AI has to beat in backtesting.

### The data model (`src/model/racecard.ts`)

- **Meeting**: course, date, surface (Turf/AW), going, `source` (sample, hand-curated or licensed feed)
- **Race**: off time, name, type (Flat/Hurdle/Chase/NH Flat), class 1–7, handicap?, distance,
  optional going override, optional hand-noted `drawBias`
- **Runner**: number, draw, name, age/sex, weight, OR, speed rating, headgear (+first-time),
  trainer & jockey (with recent strike rate and course record), odds (current + opening),
  silks colours, non-runner flag
- **PastRun** (form, most recent first): date, course, type, surface, distance, going, class,
  position (or F/PU/UR…), field size, distance beaten, OR, trainer (only if different), comment

Units are chosen for comparison: distances in **yards** (1f = 220y), weights in **pounds**
(11-7 = 161), odds as **fractional strings** ("5/2", "Evs").

### The evidence rules (`src/lib/facts.ts`)

Each rule makes one plain-English fact with a tone (✓ positive, ✕ negative, ? unproven,
• note) and a full-sentence explanation of the evidence:

| Area | Examples |
|---|---|
| Form | Won last time · Consistent · Out of form · Fell last time · Debut |
| Going | Won on soft ground · Unproven on the all-weather · Below par on soft ground |
| Trip | Won over this trip · Untried at this trip · Shortest trip yet |
| Course | Course & distance winner · Course winner · Poor record here |
| Ratings | Top rated · Best speed figure · Well handicapped · Higher mark than last win |
| Connections | Trainer/jockey in form or out of form · Trainer does well here · Jockey claims 3lb |
| Fitness | Off 218 days · Quick return |
| Changes | First-time visor · Up 2f in trip · Down/up in class · First run for new trainer · First run over fences |
| Draw | Good/poor draw (needs a hand-noted `drawBias` on the race) |
| Market | Favourite · Backed (6/1 → 4/1) · Drifting |

These are also the grounded evidence the AI will be given in step 4, so every conclusion it
draws can be traced back to the card.

## Adding races

Each file in `data/racecards/` is one meeting. Copy one of the sample files and edit it. The app
validates every file when it loads (and `npm test` does too), so a typo shows an error naming
the exact field.

Tips for hand-curating from a public racecard (private research use only):
- `id`s must be unique across all files: `course-date-time` for races, `raceId-number` for runners.
- Distances in yards: 5f = 1100, 7f = 1540, 1m = 1760, 1m 4f = 2640, 2m = 3520, 3m = 5280.
- Weight in pounds: stones × 14 + pounds.
- `form` is most recent first. Write `comment`s in your own words rather than copying a provider's.
- Only set `trainer` on a past run if the horse was with a different trainer then.
- `odds.opening` is the earliest price you saw; it drives the "Backed"/"Drifting" facts.

## Roadmap

- [x] **1. Data model**: Meeting → Race → Runner → PastRun, validated with Zod
- [x] **2. Sample racecards**: 2 meetings, 4 races, 31 runners (fictional), covering Flat AW, novice hurdle and handicap chase
- [x] **3. Web app**: race list; race page with conditions, outcome panel, runner cards, expandable analysis, glossary tooltips, dark mode, mobile layout
- [x] **5 (display)**: win-chance bar chart, ranked list, verdicts and summary at the top, wired to `RaceAnalysis`
- [ ] **4. AI layer**: server route sends the race + computed facts to the model and asks for `RaceAnalysis` JSON (structured output). Validate with Zod, check the chances sum to ~100, and cache by `raceId + hash(race data)` so a changed card re-analyses. Fall back to the baseline on error.
- [ ] **6. Value flag**: compare AI chance with the market chance (`src/lib/market.ts` already computes it) and flag big gaps, with a plain explanation
- [ ] **7. Q&A**: "which horses have won on heavy ground?", answered from the loaded cards
- [ ] **8.** Backtest win chances against historical results (log loss / calibration vs the market baseline); swap in a licensed feed in `src/data/repository.ts`; login for testers

## Compliance notes (for the public version)

- The footer already carries **18+** and safer-gambling messaging (BeGambleAware, National Gambling Helpline).
- ASA/CAP: no profit promises; any accuracy claim must be backed by recorded results. The
  backtest in step 8 and a log of every published estimate against its result will be the evidence.
- Data: the sample data is invented. Production needs a licensed feed (e.g. The Racing API,
  Goalserve, Timeform). No scraping. Silks images, ratings and race comments are provider IP.
  Use them only as the licence allows.
- `index.html` sets `noindex` while the app is private.
