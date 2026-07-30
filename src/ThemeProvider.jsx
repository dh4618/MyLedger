import React, { createContext, useContext } from 'react';
import { THEMES, THEME_IDS, DEFAULT_THEME_ID, getTheme } from './themes';
import { usePersistedPreference } from './usePersistedPreference';

// Must match the key used by the pre-React script in index.html.
const LOCAL_KEY = 'ledger-theme';
const KV_KEY = 'theme';

const ThemeContext = createContext(null);

const isValidTheme = (id) => typeof id === 'string' && THEME_IDS.includes(id);

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
  const theme = getTheme(id);
  document.documentElement.dataset.theme = theme.id;

  // Colours the iOS status bar and Android browser chrome to match the palette,
  // so there's no mismatched band above the app. Takes effect immediately.
  setMeta('theme-color', theme.themeColor);

  // 'default' gives dark status-bar text, 'black' gives light — chosen per theme
  // so the clock stays legible on Luna as well as the light palettes.
  //
  // Unlike theme-color, iOS reads this when it creates the web view, so a theme
  // change applies to the bar on the *next* launch rather than right away. It's
  // set here anyway because it costs nothing and is correct on reload.
  setMeta('apple-mobile-web-app-status-bar-style', theme.statusBar || 'default');
}

// Whatever index.html already applied — agreeing with it avoids a re-paint.
const readAppliedTheme = () => document.documentElement.dataset.theme;

export function ThemeProvider({ children }) {
  const [themeId, setThemeId] = usePersistedPreference({
    localKey: LOCAL_KEY,
    kvKey: KV_KEY,
    isValid: isValidTheme,
    fallback: DEFAULT_THEME_ID,
    readInitial: readAppliedTheme,
    apply: applyTheme,
  });

  const theme = getTheme(themeId);

  return (
    <ThemeContext.Provider value={{ theme, themeId, setThemeId, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside a ThemeProvider');
  return ctx;
}
