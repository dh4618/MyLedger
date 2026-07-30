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

## Moving your existing data across

1. In the artifact version: **Manage → Export**, then **Download file** (or copy the text).
2. In the new app: **Manage → Restore**, paste the JSON, confirm.

The storage keys and data shapes are identical, so it transfers as-is.

---

## Notes

- Data model is deliberately simple: one `kv` row per key per user. `all-days` holds the
  entire day history as a single JSON blob, which keeps request counts low. If it ever grows
  unwieldy (many years in), splitting it per-year would be the natural next step.
  The theme is a fifth key, `theme`, holding a bare id string — no schema change was needed.
- `src/storage.js` is the only file that knows about Supabase. Swapping to a different
  backend later means rewriting that one file.
- `src/storage.js` resolves your user id from the locally persisted session rather than
  calling `getUser()` (a network request) on every read and write. Beyond being much faster,
  that's what stops a flaky connection from looking like being signed out.
- Progress is derived, never stored: the bar and the `x/y` counts come from the same
  `completed` map the checkboxes already write to.
