# Ledger

A daily task app with goals, repeating tasks, presets, and keep-until-complete carry-over.
Ported off Claude Artifacts to a normal web app: React + Vite frontend, Supabase (Postgres) backend.

The migration off the artifact was a single change: `window.storage` was swapped for
`src/storage.js`, which exposes the same `get / set / delete / list` interface but talks to
Postgres. Since then it has grown character themes, a daily progress bar, and a sign-in flow
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
and `black` on Luna (light text). Note that iOS reads that second one when it *creates*
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

## Themes

**Manage → Appearance** picks one of six characters, each with its own palette:
Sprout (the original green), Mochi, Ember, Pixel, Cloudy, and Luna (dark mode). The choice is
saved to your account, so a new device picks it up after signing in.

The characters are original artwork, drawn as inline SVG in `src/themes.jsx` — no image
requests, and each one reacts to your day (asleep with nothing to do, pleased once everything
is ticked off).

Adding a theme takes two edits:
1. A `[data-theme="<id>"]` block of palette tokens in `src/theme.css`.
2. An entry in `THEMES` in `src/themes.jsx` (name, blurb, mascot component, swatches).

Then add the id and its background colour to the small map in the inline `<script>` in
`index.html` — that script applies the saved theme before React boots, which is what stops
the app flashing the wrong colours on launch.

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
