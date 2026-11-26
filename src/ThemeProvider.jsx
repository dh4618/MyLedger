import React, { createContext, useContext } from 'react';
import {
  COLOR_THEMES, THEME_IDS, DEFAULT_THEME_ID, getColorTheme,
  MASCOTS, MASCOT_IDS, DEFAULT_MASCOT_ID, getMascot,
} from './themes';
import { usePersistedPreference } from './usePersistedPreference';

// Two independent settings. They used to be one — a single `theme` choice carried
// both a character and a palette — so this provider now reads two keys.
//
// Must match the keys used by the pre-React script in index.html.
const THEME_LOCAL_KEY = 'ledger-theme';
const THEME_KV_KEY = 'theme';
const MASCOT_LOCAL_KEY = 'ledger-mascot';
const MASCOT_KV_KEY = 'mascot';

const ThemeContext = createContext(null);

const isValidTheme = (id) => typeof id === 'string' && THEME_IDS.includes(id);
const isValidMascot = (id) => typeof id === 'string' && MASCOT_IDS.includes(id);

// Sets a <meta> by name, creating it if the document doesn't have one yet.
function setMeta(name, content) {
  let meta = document.querySelector(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', name);
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', content);
}

function applyTheme(id) {
  const theme = getColorTheme(id);
  document.documentElement.dataset.theme = theme.id;

  // index.html writes the boot palette's background straight onto <html> to cover
  // the moment before the stylesheet arrives. Inline style beats the stylesheet,
  // so left alone that literal would outlive the theme it came from — switch to
  // Dracula and the iOS overscroll region behind the app would still be cream.
  // Handing it the variable keeps the guard and lets it follow the theme.
  document.documentElement.style.background = 'var(--bg)';

  // Colours the iOS status bar and Android browser chrome to match the palette,
  // so there's no mismatched band above the app. Takes effect immediately.
  setMeta('theme-color', theme.themeColor);

  // 'default' gives dark status-bar text, 'black' gives light — chosen per theme
  // so the clock stays legible on Dracula as well as the light palettes.
  //
  // Unlike theme-color, iOS reads this when it creates the web view, so a theme
  // change applies to the bar on the *next* launch rather than right away. It's
  // set here anyway because it costs nothing and is correct on reload.
  setMeta('apple-mobile-web-app-status-bar-style', theme.statusBar || 'default');
}

// Whatever index.html already applied — agreeing with it avoids a re-paint.
const readAppliedTheme = () => document.documentElement.dataset.theme;

// The mascot used to be implied by the theme, so before this setting existed a
// user who chose Mochi has `ledger-theme: 'mochi'` and no mascot key at all.
// Reading the old value here keeps their character instead of resetting everyone
// to Sprout. It is only ever a *fallback*: once a mascot is saved, this never
// runs again, and a theme id that isn't a mascot name (every new palette) fails
// isValidMascot and falls through to the default.
const readMascotFromLegacyTheme = () => {
  try {
    return window.localStorage.getItem(THEME_LOCAL_KEY);
  } catch (e) {
    return null; // Storage disabled (private browsing); the default is fine.
  }
};

export function ThemeProvider({ children }) {
  const [themeId, setThemeId] = usePersistedPreference({
    localKey: THEME_LOCAL_KEY,
    kvKey: THEME_KV_KEY,
    isValid: isValidTheme,
    fallback: DEFAULT_THEME_ID,
    readInitial: readAppliedTheme,
    apply: applyTheme,
  });

  const [mascotId, setMascotId] = usePersistedPreference({
    localKey: MASCOT_LOCAL_KEY,
    kvKey: MASCOT_KV_KEY,
    isValid: isValidMascot,
    fallback: DEFAULT_MASCOT_ID,
    readInitial: readMascotFromLegacyTheme,
  });

  const theme = getColorTheme(themeId);
  const mascot = getMascot(mascotId);

  return (
    <ThemeContext.Provider
      value={{
        theme, themeId, setThemeId, themes: COLOR_THEMES,
        mascot, mascotId, setMascotId, mascots: MASCOTS,
        // The mascot component and its aria label, which is what nearly every
        // caller actually wants — `theme.Mascot` before the split.
        Mascot: mascot.Mascot,
        ariaKey: mascot.ariaKey,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside a ThemeProvider');
  return ctx;
}
