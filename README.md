# Ledger

A daily task app with goals, repeating tasks, presets, and keep-until-complete carry-over.
Ported off Claude Artifacts to a normal web app: React + Vite frontend, Supabase (Postgres) backend.

The migration off the artifact was a single change: `window.storage` was swapped for
`src/storage.js`, which exposes the same `get / set / delete / list` interface but talks to
Postgres. Since then it has grown colour themes, mascots, a daily progress bar, and a sign-in flow
built for the iPhone Home Screen — see the sections below.

---

## Setup

### 1. Install
```bash
npm install
```

### 2. Create the Supabase project
1. Sign up at supabase.com and create a new project (free tier is plenty).
   Save the database password it asks you to set — you won't need it for this app, but
   it's a pain to recover later.
2. Open **SQL Editor → New query**, paste the contents of `supabase/schema.sql`, and run it.
   This creates the `kv` table and — importantly — the row-level security policy that stops
   anyone reading anyone else's rows.
3. Go to **Settings → API Keys → "API Keys" tab** and copy the **publishable key**
   (starts with `sb_publishable_`).
   Then **Settings → Data API** for the **Project URL**.

   > Projects created before Nov 2025 may show a legacy **anon** key (a long `eyJ...` string)
   > under the *Legacy API Keys* tab instead. Either works — the app accepts both.

### 3. Configure
```bash
cp .env.example .env
```
Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

The publishable key is designed to be visible in a browser bundle — but *only* because row-level
security is switched on, which is what step 2.2 does. Skipping that step would leave the
database open to anyone. Never put a **secret** key (`sb_secret_…` or `service_role`) in
frontend code; those bypass RLS entirely.

### 4. Run
```bash
npm run dev
```

### 5. Set a password (first run only)

Sign-in is **email + password**. Nothing else is required — no SMTP provider, no email
template changes, no rate limits to work around.

A brand-new account has no password yet, so the very first sign-in bootstraps one:

1. On the login screen, tap **No password yet, or forgotten it?** and send yourself a link.
2. Tap the link (in any browser — this first step is fine in Safari).
3. Once you're in: **Manage → Account → Set a password**.

After that, every device signs in with the password and stays signed in. The session
refreshes itself in the background, so you shouldn't be asked again unless you use
**Manage → Sign out**.

**Why a password rather than a magic link.** On iOS a Home Screen web app gets its *own*
storage container, separate from Safari's. Tapping a link in Mail opens Safari, so Safari
gets signed in and the Home Screen app stays signed out — which is why a link-only flow
feels broken on a phone. A password is typed into the app itself, so the session lands
where you need it. The email/password fields carry the right `autocomplete` attributes, so
the iOS keychain offers to save them and a return visit is one tap.

The emailed link stays available as the recovery path if you forget the password.

<details>
<summary>Optional: 6-digit codes in the email as well</summary>

The link-fallback screen also accepts a 6-digit code, but Supabase's stock email template
only renders the link, so there's nothing to type unless you customise it — and editing
templates now requires custom SMTP. If you have SMTP configured anyway, add `{{ .Token }}`
to **Authentication → Email Templates → Magic Link**:

```html
<h2>Sign in to Ledger</h2>
<p>Your code:</p>
<p style="font-size:28px;letter-spacing:6px;font-family:monospace"><strong>{{ .Token }}</strong></p>
<p>Or <a href="{{ .ConfirmationURL }}">tap this link</a> on a computer.</p>
```

This is entirely optional — password sign-in doesn't need it.

</details>

---

## Deploy

```bash
npm run build
```

Then either:
- **Vercel** — push to GitHub, import the repo at vercel.com, add the two `VITE_…` env vars
  in the project settings. Every `git push` redeploys automatically.
- **Netlify** — same flow; build command `npm run build`, publish directory `dist`.

Add your deployed URL to **Supabase → Authentication → URL Configuration → Redirect URLs**,
otherwise the emailed link will bounce back to localhost. (Password sign-in doesn't depend on
this, but the link recovery path does.)

---

## Add to iPhone Home Screen

Open the deployed URL in **Safari** → Share → **Add to Home Screen**.
It picks up the diary icon from `public/apple-touch-icon.png` and opens full-screen
(no address bar) thanks to the manifest and meta tags in `index.html`.

Sign in **inside the Home Screen app** with your email and password — don't use the email
link here, which would open Safari and sign in the wrong browser. Set the password first on
a computer (**Manage → Account**) if you haven't yet. Once that's done the app keeps you
signed in, and `public/sw.js` lets it open with no connection at all.

### If it opens zoomed in

**Delete the Home Screen shortcut and add it again.** iOS stores the pinch-zoom scale per
installed web app and keeps it across launches, so a stale zoom survives any amount of
redeploying. Re-adding the shortcut is what clears it.

What caused the zoom in the first place: iOS silently zooms the page whenever a field with
a font-size under 16px takes focus, and never zooms back out. One tap on a text box was
enough to leave the app permanently scaled. Every focusable field is now 16px or larger,
with an iOS-only `@supports` block at the end of `src/theme.css` setting that as the
default for anything unstyled. **If you add a field, keep it at 16px minimum** — this is
the single easiest way to reintroduce the bug.

Related iOS handling, all in `src/theme.css`:

- `100dvh` / `85dvh` rather than `vh`, which iOS reports incorrectly.
- `env(safe-area-inset-*)` on the header, the `+` button, and every bottom sheet, so
  nothing hides behind the Dynamic Island or the home indicator. These resolve to `0`
  everywhere else, so they're invisible on desktop.
- `text-size-adjust: 100%` stops iOS inflating text on its own.
- `touch-action: manipulation` on buttons and rows removes double-tap-to-zoom.

The status bar is coloured per theme via `theme-color`, with
`apple-mobile-web-app-status-bar-style` set to `default` on the light themes (dark text)
and `black` on Dracula (light text). Note that iOS reads that second one when it *creates*
the web view, so a theme change reaches the status bar on the next launch, not immediately.

---

## Language

**Manage → Language** switches between English and 简体中文. The choice is saved to your
account, so a new device picks it up after signing in. On a device that has never chosen,
the initial language comes from the browser's own preference — any `zh*` locale starts in
Chinese.

There's no i18n library. For two languages and ~160 strings, a plain dictionary in
`src/i18n/strings.js` is smaller than the machinery, and every avoided dependency is
bytes the service worker doesn't have to cache offline. `t()` lives in
`src/i18n/LanguageProvider.jsx` and does `{name}` substitution; a missing key falls back
to English and then to the key itself, so a gap shows readable English rather than a blank.

**To add a language:**

1. Add a dictionary and a `LANGUAGES` entry in `src/i18n/strings.js`. `locale` is passed
   straight to `Intl.DateTimeFormat`, which handles all date formatting — there are no
   month or weekday name lists to translate. Only `days.letters` and `days.abbr` are
   hand-written, because the week strip needs single characters.
2. Add the id to the `LANGS` map in the inline script in `index.html`, so the saved
   language applies to `<html lang>` before React boots.
3. If the script isn't Latin or CJK, add a suitable family to `--font-ui` and
   `--font-display` in `src/theme.css`.

Two things worth knowing if you touch this:

- **Keep keys in parity.** Every key must exist in both dictionaries. Nothing enforces
  this at build time; the check is in the verification script.
- **`t` is the translate function, so don't shadow it.** Two `.map()` callbacks in
  `Ledger.jsx` deliberately use `task` and `th` as their parameter names for this reason.

Chinese glyphs come from the system (Yuanti SC and PingFang SC on iOS, Microsoft YaHei on
Windows) rather than a downloaded webfont, so the Chinese UI costs no extra bytes and still
works with no connection. Two ordering rules in `--font-display` and `--font-ui` are
load-bearing:

- **Latin families come first.** Fallback is per-glyph and CJK fonts carry their own rather
  poor Latin glyphs, so a CJK family placed ahead of Inter or Georgia would capture Latin
  text whenever the webfont failed to load.
- **The display stack is rounded sans for Chinese, not serif.** Songti SC and its Windows
  counterpart SimSun are high-contrast 宋体 faces that look spiky at heading sizes. 圆体
  Yuanti SC is rounded and suits the mascots. The trailing `serif` generic is for Latin
  only — with four named CJK families ahead of it, Chinese never reaches it.

Two Chinese-only corrections live under `html[lang='zh-CN']`: the tagline drops its italic
(no true italic CJK face exists, so browsers synthesise a smeared slant) and the wordmark
drops its negative tracking (full-width characters are already tightly fitted).

---

## Getting around

A **bottom tab bar**: Day, Pet, Progress, List. **Settings stays as a gear in the header** —
it's the one you open least, and four wide tabs beat five narrow ones on a phone. The
groceries badge rides on the List tab, so you still see at a glance that there's shopping
to do.

The panels are still sheets over the day page rather than separate screens, so **Day means
"close whatever is open"**, and which tab reads as current follows from which sheet is up —
there's no second piece of state to fall out of step with it.

Three things have to agree about the bar's height: the page's bottom padding, the FAB's
offset, and the bar itself. That's `--tabbar-h` in `src/theme.css`, so they can't drift
apart.

The bar sits at `z-index: 55` — **above the panel sheets (50)** so a tab is always one tap
away without closing the current one first, and **below the modals and the calendar (60)**,
which are meant to block everything until you answer them. The sheets pad their bottom by
`--tabbar-h` so their last rows don't hide behind it.

---

## Themes

**Manage → Appearance** picks one of four palettes, saved to your account so a new device
picks it up after signing in: **Rosé Pine Dawn** (soft pinks and lilac, the default),
**Wa-iro** (traditional Japanese colours), **Dracula** (dark, neon accents) and **Swiss**
(black, white and one red).

Appearance used to hold a second setting for the mascot. The hatchery replaced *choosing* a
character with *earning* one, so that picker is gone and the six SVG characters along with
it — see **Hatchery** below.

### Tokens

Every colour in the app resolves through one of these, set per palette on
`[data-theme="<id>"]`. No component carries a literal colour.

| Token | Use |
|---|---|
| `--bg` | Page background |
| `--surface` | Cards, sheets, inputs, chips |
| `--ink` | Main text; also the selected-day pill background |
| `--muted` | Secondary text, labels, empty checkbox borders |
| `--line` | Dividers, borders, progress track |
| `--accent` | Primary buttons, FAB, selected chip, progress fill, ticks |
| `--on-accent` | Text and icons on top of `--accent` |
| `--danger` | Overdue label and text |
| `--goal-1` … `--goal-5` | Goal colours, by position |

`--accent-soft`, `--danger-soft`, `--on-goal` and friends are derived once with
`color-mix()` from whichever palette is in force, so a palette never states them.

**Goal colours are no longer stored on the goal.** They come from the palette by the goal's
*position* in the list, so they change with the theme instead of being frozen hex from
whenever the goal was created; a sixth goal wraps back to the first slot. Tapping a goal's
badge still cycles it, which writes a `colorSlot` override. The old `color` field on existing
goals is simply ignored.

Swiss is the one palette that also swaps `--font-display`: the serif reads as editorial
rather than International Style, so it takes a grotesque with `--display-tracking` and
`--display-weight` to match.

Adding a palette takes three edits:
1. A `[data-theme="<id>"]` block of tokens in `src/theme.css`.
2. An entry in `COLOR_THEMES` in `src/themes.jsx` (name key, `themeColor`, `statusBar`).
3. The id and its background in the small map in the inline `<script>` in `index.html` —
   that script applies the saved theme before React boots, which is what stops the app
   flashing the wrong colours on launch.

The picker's preview cards carry `data-theme` on themselves, so each paints straight from
`theme.css` rather than repeating the hex in JavaScript.

---

## Hatchery

The **Pet** tab. Completing a task earns a **star**; stars buy a **mystery egg** and the
food that grows it; opening the egg settles which of four creatures — Fox, Frog, Tabby Cat
or Inky — is inside.

### Feeding

**Nothing grows by itself.** Completing a task earns a star and does nothing else; growth
costs a star, spent on the **Feed** button, and one meal is one step of progress.

Growth used to accrue from the task count while something sat in the slot, which made the
whole hatchery something that happened to you rather than something you did, and gave a
completed task two separate rewards for no extra choice. Now the day's work becomes stars
and the stars go on either a new egg or a bigger creature.

That also took a whole class of state out of the model. `liveProgress(entry, game, total)`
is gone, and with it `activeFrom` and the running `settle()` pass that re-derived
transitions from the task count on every render: progress is on the entry, feeding writes
it, and hatching and outgrowing the slot are settled on the spot. Seven functions that took
a `total` they no longer read — `collection`, `album`, `hasPicture`, `pinIcon`, `iconFor`,
`residents`, `knownSpecies` — lost the parameter, because a `total` they quietly ignored
says the opposite of what is true.

A save written under the old rules is **folded forward once** by `migrate()`: whatever auto
growth had accrued is banked onto the pet, so nobody loses a creature's worth of progress to
the change, and stars are untouched since none were ever spent on growing. `activeFrom` is
the marker — it is in every old save and no new one, which is why `normalizeGame` carefully
does *not* default it. Like `settle`, it returns its argument unchanged when there is nothing
to do: minting a fresh object every call is what turned the caller's "persist if it changed"
into an infinite render loop once before.

### Ta-da

A stage change — hatching, kid to young adult, young adult to adult — raises a **Ta-da!**
over the whole panel for a couple of seconds: the new sprite popping in held frames, eight
squares flung out along their own angles, then the name and the new stage. A tap dismisses
it early. For a hatch it is also where the name is revealed, which is the first time either
the animal or its name has been shown.

It watches **every** owned entry's stage, not just the one in the slot. Reaching adult
releases the slot in the same update that changes the stage, so anything hanging off the
active entry would miss the last and best of the four transitions.

### Not telling you what it is

**Opening an egg does not tell you what it is.** The species is rolled and written down, but
the name shows as `???` until one of that species has hatched: the name is the payoff for
hatching, not for buying. One hatched fox names foxes for good, so a second fox egg has
nothing left to hide. That rule is `knownSpecies()` in `src/game.js`, derived like everything
else here — "has one of these ever hatched" is just "is any of them past the egg stage" — and
the panel routes every name through one function, so the room, the collection, the album and
the slot can't disagree about what you know.

### The room

At the top of the tab is a **room**, with a hatch half on the left and a play half on the
right. Eggs wait in the nest; hatched creatures play on the mat. Only hatched creatures
walk, an opened egg sits there so the room isn't empty while you're incubating, and an
unopened one stays out of it because you don't know what's in it.

**The two halves are a concept, not furniture.** Neither is captioned and nothing is drawn
between them: where the nest and the mat are is what says it, and a label on each would be
the app explaining its own furniture. There are no words in the room at all.

The zone table lives in `HatcheryPanel` and is handed to CSS as custom properties rather than
written out twice, so the nest is drawn at the middle of the band eggs stand in and the two
can't drift apart as the layout is tuned.

**Creatures blink**, every few seconds, with their eyes actually closed: each sprite has a
second drawn frame, and the blink is that frame laid over the first and uncovered for a
sixth of a second. It can be revealed rather than cross-faded because the pair share a
canvas and differ only in the eyes, so the top frame covers the one beneath wherever it is
drawn at all — one animation, no second timeline to drift out of step.

An egg has no eyes, so its second frame is the whole shape nudged a pixel: the same
machinery **wobbles** it.

The period and offset are seeded per resident, in **tenths** of a second. Whole seconds gave
six periods and seven offsets, and three creatures found a collision on the first try — the
same lesson as the stacked residents, one layer down.

**Who is in front** follows who is standing lower: `z-index` is the resident's `top`, so two
creatures sharing a patch of mat read as one in front of the other rather than as a drawing
order nobody chose.

**Eggs are laid out, creatures are scattered.** A creature's spot, roam and gait all come from
a hash of its id, so it keeps them across re-renders instead of teleporting on every repaint.
That hash is an **avalanche mix, not `h * 31 + char`**: `genId()` is a timestamp plus a short
random suffix, so two creatures bought in the same session differ in a character or two, and
a weak hash put them within a couple of percent of each other — the room looked like one
stacked pile. Eggs get no hash for their x: they are spaced evenly across the nest in
collection order, because seeded spots in a band that narrow piled two eggs on top of each
other often enough to look like a bug, and eggs in a nest sit in a row anyway.

`left` is the **middle** of a resident, not its left edge — the sprites are 12 to 21 pixels
wide, and a shared left edge put a tall thin egg and a wide cat in visibly different places
within the same band. The wander animation is therefore on an inner element, since the outer
is already using its transform to centre the sprite.

Wall, rail and floor are hard-stop CSS gradients; the nest and ball are sprites. The first
version tiled both surfaces with small alternating squares, which is the pattern every image
editor uses to mean *nothing here* — the room read as a missing background. Striped paper and
grouted tiles say wall and floor instead.

### Pacing and price

Pacing is `STAGE_STEPS` in `src/game.js`: **5 meals** to hatch, **10 more** to young adult,
**15 more** to adult — thirty for a full-grown creature, each stage asking more than the
last. `STAGE_AT` is derived from it, so the thresholds have one source of truth.

`EGG_PRICE` is what an egg costs: **10 stars**, enough that the first one is something you
work towards, which is what makes buying it worth anything. `FEED_COST` is what a meal
costs: **1 star**, so a creature raised from egg to adult is forty tasks all told.

> **Both are currently turned down for testing**: `STAGE_STEPS` is `[1, 1, 1]` and
> `EGG_PRICE` is `1`, so the whole loop runs in a handful of taps. Put them back to
> `[5, 10, 15]` and `10` before this is used for real.

### The album, and the icon

Every stage a creature reaches is kept as a **picture** you own, listed in the album at the
bottom of the hatchery. It needs no stored state: progress only ever goes up, so the stages
a creature has passed through are implied by where it is now. A young adult fox has been an
egg and a kid; an opened egg that hasn't hatched is just an egg; an unopened one contributes
nothing, because you don't know what it is. Two creatures of the same species share one row.

Only pictures you have actually collected appear — no locked silhouettes. A row whose species
hasn't hatched yet is headed `???` and holds the one egg picture, which is the album's half of
the same rule the rest of the panel follows.

Tapping a picture **pins** it as the app's face, in the header, the loading screen and the
empty state. Tapping the pinned one again clears it.

**The face is the pinned picture, or the generic egg.** Nothing else sets it. It used to
fall back to whatever you were raising, which meant the icon changed under you every time a
creature grew; now it stays where you put it. A new account sees an egg, as does the
signed-out auth screen, which has no account to read a creature from.

The pin is **checked against the album** rather than trusted. A pin naming a picture you
don't own gives the generic egg instead of a creature you never raised. Nothing in the app
can produce that, but a hand-edited blob can.

### Earning a star

The **star total sits in the header**, so it's there on every tab and a flying star always
has somewhere to land. Ticking a task **throws** one from the checkbox, carrying a **+1**,
and the counter squeezes as it arrives.

**It is a throw, not a slide.** Three nested elements, one motion each: the outer carries the
star along the straight line between the two points, the middle adds the rise and fall that
bends that line into an arc, and the sprite does the pop and the blink. The lift is computed
from the distance in `launchStar`, so a tick near the counter is a flick and one from the
bottom of a long day is a proper lob. A single keyframe set would have to spell the parabola
out position by position in px, with the height baked in.

**The star and the +1 are drawn, not icons**, and the motion is **stepped** — the travel hops
once per ~14px, the arc holds eight heights off `4t(1−t)`, the sprite scales only by whole
multiples (3x, and 0.667 of that is 2x). Moving pixel art smoothly, in a lucide outline, is
what made the old straight line read as a browser effect laid over the game rather than part
of it. The counter it lands in is the same drawing.

Every one of those keyframe sets finishes at **92%** and holds. `steps(n, end)` shows the
value a segment *starts* at, so a two-keyframe animation would leave the star one step short
of the counter and then be removed at `animationend`, having never drawn the arrival.

**The flight delivers the increment**: the displayed number holds back however many stars
are still in the air (`balance − flights.length`), so it goes up as each one lands rather
than jumping before it gets there. It self-corrects — a flight leaves the list when its
animation ends — and it's clamped at zero so unticking mid-flight can't show a negative.

Stars in flight are `position: fixed` with `pointer-events: none`. Without that, one passing
over a row would eat the tap, and ticking three things quickly would miss.

**Unticking is quiet**: the count drops with no flight and no −1. It's a correction, not
something to celebrate. And under `prefers-reduced-motion` no star is launched at all — the
count still updates, it just arrives without the journey.

**Stars are derived, never banked.** `balance = (tasks completed ever) − baseline − spent`,
where the baseline is the completed-task count captured once, the first time the hatchery
runs, and `spent` is eggs bought plus meals fed. That is how stars start at zero without a
migration, and it means unticking a task takes its star back — the balance is a view of the
log less what you have bought with it, not a parallel ledger that can disagree with it.

Growth, by contrast, **is** banked, and deliberately so. Untick a task after feeding and you
go a star down; the meal is not regurgitated. Growth is what you bought with the star, and
buying is the one thing in the app that is not a view of the log.

Counting uses `completed[id] === true`, not key presence. Unticking writes `false` rather
than deleting, so counting keys would pay you for work you undid — the same trap the streak
hit.

**One slot.** Eggs you own sit dormant until you choose one, and while something is in the
slot nothing else may enter. The slot holds a growing creature too, not only an egg, or
"one at a time" would quietly stop applying the moment something hatched. It is also where
food goes. Putting something down keeps everything it has eaten — there is nothing to bank,
since feeding writes progress the moment it happens — and picking it back up resumes from
exactly there.

**Nothing here can tick a task.** The hatchery reads the log and never writes to it, so the
report and the streak stay true no matter what happens in the game. There is a test that
runs a month of game actions and asserts the `days` blob comes out byte-identical.

### The art

`src/pixels.js` holds all sixteen creature sprites — **two frames each** — as a palette plus
one string per row. A few KB gzipped, no image requests, crisp at any size through `<Pixel>`,
and a redraw replaces that one file. They keep their own palettes rather than being
recoloured per theme: they are drawn artwork, and each carries its own outline, so they read
on every palette. `alt` is the second frame against the same palette: eyes closed, or for an
egg the whole shape nudged a pixel.

It is generated from 32 transparent 24×24 PNGs, and **three properties of that source are
load-bearing**. A redraw should keep all three:

- **One canvas size for everything.** The frames of a pair then stack exactly, which is what
  lets the blink be one drawing over another instead of a swap; and the stages sit at their
  true relative sizes, a kid smaller than an adult because it is drawn smaller rather than
  because `<Pixel>` was handed a number.
- **Bottom-aligned.** Every creature stands on the canvas's last row, so one placement rule
  puts any shape's feet on the floor.
- **A real alpha channel.** The first set of these was recovered from a flat sheet, where
  transparency had to be guessed by flood-filling from outside each sprite — deciding it by
  colour got the frog's eyes, the cat's muzzle and Inky's page wrong, since those are white
  *paint* rather than holes, which is invisible on a light background and obvious on Dracula.
  With alpha there is nothing to guess.

Because the canvas is uniform, `<Pixel>` has to be told which of two things `size` means.
`fit="content"`, the default, crops to the drawn pixels so a picture **fills the slot it is
given** — what a header icon, a shop row or an album thumbnail want, and what every sprite
did implicitly back when they were stored pre-trimmed at sixteen different sizes. The room
passes `fit="canvas"` to keep the whole frame, for the two reasons above: relative sizes, and
frames that line up. Cropping an egg's wobble frame to its content would faithfully undo the
wobble.

Below the creatures, the same file holds the app's own **furniture**: the star, the `+1`, the
nest, the ball. Those are the other way round — UI, not artwork, so they have to sit inside
four palettes without looking pasted on, and their palettes are **CSS rather than hex**:
`currentColor`, `var(--accent)`, `color-mix(...)`. `<Pixel>` renders a palette entry
containing `(` as an inline style rather than a `fill` attribute; var() in a presentation
attribute is thinly supported and silently paints black where it isn't.

Two things learned drawing them, both visible in the comments:

- **At nine pixels, silhouette is everything and shading is noise.** The star had a pale
  highlight through its upper arm; mixed light enough to read as light, it was
  indistinguishable from the background and the star looked notched. It is solid now.
- **The reverse holds at twenty.** The nest was first a two-row basket weave, which at 4x was
  a grey plank. Drawn as a bowl — dark rim, pale opening, body falling away, a sparse weave
  inside a defined outline — it reads.

Sprites are scaled by **whole multiples**. A 9-wide sprite at 14px renders some pixels 1px
and some 2px, which on a shape that small is a lopsided star; that is why there is a separate
7-wide `PIXEL_STAR_SMALL` for the 14px slots rather than a bad scale of the 9-wide one.

---

## Groceries

The **shopping trolley** in the header opens a standing list, with a badge showing how many
items are still to buy. Type an item and press enter; the field keeps focus, so a few
things go in at once. Ticking something off strikes it out and drops it below a divider
rather than deleting it, so you can see what's already in the trolley and untick a mis-tap;
**Clear bought** removes them in one go and remembers their names as **Buy again** chips,
which re-add a weekly staple in one tap.

This is the only thing in the app that isn't anchored to a date, and that's the point of
its being separate. Filing groceries as tasks under a "Groceries" goal would technically
work, but a dozen items would bury the three things you actually planned to do that day and
count against the day's progress bar. So it gets its own `kv` key and its own sheet, and
touches nothing else:

```js
{ items: [{ id, name, bought, addedAt }], recent: ['Milk', …] }
```

`recent` is what you last cleared, newest first, capped at 12. A missing key means an empty
list, so there is nothing to migrate. The reducers in `src/groceries.js` are pure functions
of `(list, input) → list`, which is why `src/GroceryList.jsx` is only markup and
`Ledger.jsx` only wiring.

Two behaviours worth knowing, both matched on the trimmed, case-folded name so `Milk` and
`milk ` are the same thing:

- Adding something **already on the list** doesn't duplicate it — the existing row flashes
  instead, so it reads as "already there" rather than as nothing happening.
- Adding something **already bought** un-ticks it and lifts it back to the top. You've
  decided you need it again, which is better served than by a second identical row.

The add field is deliberately **not** autofocused. At the shop you're ticking things off,
and a keyboard covering the list is worse than one extra tap when you do want to type.

---

## Moving your existing data across

1. In the artifact version: **Manage → Export**, then **Download file** (or copy the text).
2. In the new app: **Manage → Restore**, paste the JSON, confirm.

The storage keys and data shapes are identical, so it transfers as-is.

---

## Notes

- Data model is deliberately simple: one `kv` row per key per user. `all-days` holds the
  entire day history as a single JSON blob, which keeps request counts low. If it ever grows
  unwieldy (many years in), splitting it per-year would be the natural next step.
  The theme is another key, `theme`, holding a bare id string, and the shopping list another,
  `groceries` — neither needed a schema change. **Anything added here also has to go into
  Export and Restore** (`openExportModal` and the restore path in `Ledger.jsx`), or a restore
  silently wipes it.
- `src/storage.js` is the only file that knows about Supabase. Swapping to a different
  backend later means rewriting that one file.
- **Tap-at-a-time writes are debounced, so they need a write-ahead copy.** Day and grocery
  writes batch for 600ms before going to the network, which leaves a window where a change
  exists only in memory. An installed iOS web app is very good at closing inside that
  window — and `beforeunload`, which the flush used to rely on, essentially never fires
  there. `src/useDurableBlob.js` closes the gap, and both `all-days` and `groceries` go
  through it:
  - The blob is mirrored to `localStorage` *synchronously* on every write
    (`src/pendingWrites.js`, one entry per storage key), and the mirror is cleared only
    once the server confirms. A mirror still present at the next launch means the last
    write never landed, so it is replayed. This also covers ticking something off — or
    adding to the shopping list — with no connection.
  - The flush is triggered by `visibilitychange` → hidden and `pagehide`, not just
    `beforeunload`. `visibilitychange` fires while the page is still alive, so the
    write has time to finish instead of being abandoned mid-flight.

  The mirror is keyed by user id and discarded if it belongs to a different account.
  Replay is last-writer-wins, like every other write to this single-blob model, so a
  second device that was edited in between can be overwritten — the alternative was
  silently dropping the tick we are trying to save.
- **A lost tick doesn't just look unticked — it moves the task.** A keep-until-complete
  task's home day is derived from where its completion is recorded, so losing the write
  re-homes it to today, where it reappears looking like it was never done. That is the
  symptom the write-ahead copy exists to prevent, and it's why the bug reads as a
  carry-over problem rather than a saving one.
- `src/storage.js` resolves your user id from the locally persisted session rather than
  calling `getUser()` (a network request) on every read and write. Beyond being much faster,
  that's what stops a flaky connection from looking like being signed out.
- Progress is derived, never stored: the bar and the `x/y` counts come from the same
  `completed` map the checkboxes already write to.
- **Goals come in two kinds.** `kind: 'ongoing'` is a category that never finishes —
  Fitness, Reading. `kind: 'project'` is something you can achieve — "see the northern
  lights", broken into tasks like "book flights". **An absent `kind` means ongoing**, so
  goals created before this existed need no migration.
  - Achieving is *gated*, not free-form: the action only appears when nothing is
    outstanding — no repeating task still active, and every one-off ticked. A project with
    **no tasks at all** counts as complete, which is what lets you record something you
    simply went and did. Note this inverts the old `goalIsDone`, which treated "no tasks"
    as not-done; that only drove a transient badge, whereas this gates a durable action.
  - `achievedDate` is durable and survives adding tasks later — unlike the old computed
    badge, which flipped back.
  - **An achieved goal takes no new tasks.** Two entry points are closed: the goal picker
    in the task form, and "Add task" in the goal's detail view. The preset quick-add only
    appears once a goal is selected, so closing the picker closes it too. When *editing* a
    task that already belongs to an achieved goal, that goal stays selectable so the task
    can't silently lose it.
  - Unticking a task under an achieved goal reopens the goal, behind a confirm naming the
    goal and its date — the record is never lost silently.
- **A preset is a template, and a goal's history is a log — the goal screen keeps them
  apart.** Laundry has no schedule: you add it on whichever day you feel like doing it,
  and each time it lands on a day it is an ordinary one-off. That makes two sections:
  - **Ready to add** lists *every* preset for the goal, each with a one-tap `+ Today`
    that writes a one-off onto today carrying the preset's time, goal and carry-over
    flag. It reads *On today* and stops taking taps once an instance is already there,
    matched on name alone — re-adding under a different time still counts as already
    there, which is the safer way to be wrong.
    - This section used to filter out any preset a day row matched, so a preset
      **disappeared exactly as you started using it** — the template you reach for most
      often was the one thing the screen hid. A preset is a template; using it is not a
      reason to hide it.
  - **History** groups past instances by name, trimmed and case-folded (not name+time:
    laundry at 09:00 and laundry with no time are the same activity, and the hour still
    shows on each instance). A group with one instance renders flat, with no chevron.
    - **Nothing is struck through here.** A crossed-out "Laundry" says finished, about a
      thing due again next week. Done reads as a muted tick against the date; an instance
      never completed gets a *not done* chip, which is real information the old
      strike-through made indistinguishable from done.
  - Promoting an ad-hoc task to a preset moved from a per-row checkbox into the
    instance's `⋮` menu — same capability, one less control on every row.
- **A streak counts days you did *something*.** A day is active if you ticked anything at
  all — not if you finished everything. Doing one thing counts, which is what separates a
  streak that gets you to open the app from one that punishes you for a busy Tuesday.
  - **Active is tested on the values, not the keys.** Unticking writes
    `completed[id] = false` rather than deleting the entry, so a day you ticked and then
    changed your mind about still has a populated map. `Object.keys(...).length` would
    call that an active day; it isn't.
  - **An unfinished today does not break the streak.** The day isn't over, so the count
    runs to yesterday and `includesToday` says whether today is in it yet. Without that
    the number would reset to zero every morning and re-earn itself by lunchtime.
  - What *does* break it is any day with nothing ticked, **including a day with nothing
    scheduled**. That is deliberate: the rule stays sayable in one sentence, and there is
    nothing to argue about after the fact.
  - Longest run compares **calendar-adjacent** days. The blob only holds days you touched,
    so two keys next to each other in sort order can be a month apart.
- **The progress report scores repeats and counts everything else.** A repeat has a
  schedule, so it has a denominator: *6/8 · 75%*, with one dot per due day so you can see
  where the misses fell. An on-demand task has no schedule, so it gets a plain count —
  *Laundry 3×*. Dividing that by an invented target would turn "I did laundry three times"
  into "you failed at laundry", which is not information.
  - **The report never re-derives the schedule.** It calls `getTasksForDate` once per day
    in the range and counts what comes back, so it agrees with what the day page actually
    showed, by construction. A second implementation of the recurrence rule would drift
    from the first — silently, and exactly at the month-end clamp and the skip list.
  - That also decides a judgement call for free: **an occurrence you skipped is not a
    miss.** `removedRecurring` means "not due that day", so it never reaches `report.js`
    and the denominator shrinks instead of counting against you.
  - **Counting stops at today.** Days later this week or month haven't happened, so they
    are not misses — without that the current month would look wrecked every 1st. A period
    still running is labelled *so far*.
  - `src/report.js` is pure — no React, no storage, no Intl — which is why most of its
    behaviour can be asserted in plain node. `src/dates.js` holds the date arithmetic it
    and `Ledger.jsx` share; it exists so the report doesn't have to import the god
    component to ask what day it is.
- The goal pills row shows only goals with tasks on the day you're viewing, plus whichever
  is currently filtered. Without that, every long-term project would sit in the row forever.
  A past day still shows the pills for goals that had tasks that day, which is what you
  want when looking back.
- **Repeating tasks come in two frequencies.** `freq: 'weekly'` matches on `days`
  (0–6, Sunday-based); `freq: 'monthly'` matches on `monthDays` (1–31). **An absent
  `freq` means weekly**, so templates stored before monthly existed need no migration.
  A month too short for the chosen date fires on its *last* day instead — so the 31st
  still happens in February, and picking 31 is how you say "month end". That clamp is
  why the summary line names 31 rather than printing it.
- **A keep-until-complete task is stored on one day but lives on another.** It stays in
  `days[created].oneOff` forever, while the day it appears on — and the `completed` map
  its tick is written to — is its *home* day: the day it was ticked off, or, while it's
  still outstanding, the later of today and the day it was planned for (`carryHomeDay`).
  That "later of" is what makes planning ahead work: without it a task you put on next
  Tuesday is dragged onto today immediately, since "carry forward" has nothing to carry
  until its day arrives. Anything reading task state by walking `days`
  has to follow that indirection or the task reads as untouched. Manage's task list and
  the goal-steps-complete rule both do. Edit and delete are the other way round — they
  mutate the stored object, so they use the storage day, which is why manage rows carry
  both `dateStr` (home) and `sourceDateStr`.
- **Manage's "Others" is a real goal view, not a leftovers list.** It shows the same
  tasks the day page files under Others, matched the same way — `!goalById(...)`, so a
  task whose goal was deleted stays reachable rather than being editable nowhere.
- The day page groups tasks: everything with a time first in time order, then a section
  per goal in the same order as the filter pills, then anything without one under
  **Others**. Completed tasks sink to the bottom of their *own* section rather than
  leaving it, so sections keep a stable size. A task whose goal has since been deleted
  keeps a `goalId` that no longer resolves — grouping tests `goalById()` rather than the
  bare id so those land in Others instead of disappearing.
