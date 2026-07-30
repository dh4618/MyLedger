import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { storage } from './storage';
import { THEMES, THEME_IDS, DEFAULT_THEME_ID, getTheme } from './themes';

// Must match the key used by the pre-React script in index.html.
const LOCAL_KEY = 'ledger-theme';
const KV_KEY = 'theme';

const ThemeContext = createContext(null);

const isValid = (id) => typeof id === 'string' && THEME_IDS.includes(id);

// The theme is stored twice on purpose:
//
//   localStorage — read synchronously by index.html before React boots, so the
//     first paint is already the right colour. Without it you'd see a flash of
//     the default palette on every launch.
//   kv (Supabase) — the durable, per-account copy, so a new device or a cleared
//     browser picks the theme back up after signing in.
//
// localStorage wins at startup; the server value is reconciled in once a session
// is available.
function initialThemeId() {
  if (typeof document !== 'undefined') {
    // Whatever index.html already applied — agreeing with it avoids a re-paint.
    const applied = document.documentElement.dataset.theme;
    if (isValid(applied)) return applied;
  }
  try {
    const saved = window.localStorage.getItem(LOCAL_KEY);
    if (isValid(saved)) return saved;
  } catch (e) {
    // Storage can be unavailable in private browsing; the default is fine.
  }
  return DEFAULT_THEME_ID;
}

function applyToDocument(id) {
  const theme = getTheme(id);
  document.documentElement.dataset.theme = theme.id;

  // Keeps the iOS status bar and Android browser chrome in step with the palette.
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', theme.themeColor);

  try {
    window.localStorage.setItem(LOCAL_KEY, theme.id);
  } catch (e) {
    // Non-fatal: the account copy in kv is the durable one.
  }
}

export function ThemeProvider({ children }) {
  const [themeId, setThemeIdState] = useState(initialThemeId);
  // Lets the async server sync compare against the live value without being a
  // dependency of the effect that runs it.
  const themeIdRef = useRef(themeId);
  themeIdRef.current = themeId;

  // Re-assert on mount so the meta tag and localStorage are correct even if the
  // inline script was blocked or the saved value was stale.
  useEffect(() => {
    applyToDocument(themeIdRef.current);
  }, []);

  const setThemeId = useCallback((id) => {
    if (!isValid(id) || id === themeIdRef.current) return;
    setThemeIdState(id);
    applyToDocument(id);
    // Best effort: localStorage already has it, so a failed write here only
    // means this choice won't follow you to another device yet.
    Promise.resolve(storage.set(KV_KEY, id)).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncFromServer = async () => {
      try {
        const row = await storage.get(KV_KEY);
        if (cancelled) return;
        const remote = row && row.value;
        if (isValid(remote)) {
          if (remote !== themeIdRef.current) {
            setThemeIdState(remote);
            applyToDocument(remote);
          }
        } else if (themeIdRef.current !== DEFAULT_THEME_ID) {
          // Nothing saved on the account yet, but this device has a preference —
          // seed the account with it so other devices inherit the choice.
          await storage.set(KV_KEY, themeIdRef.current);
        }
      } catch (e) {
        // Offline, signed out, or the read failed. The local theme stands; this
        // is cosmetic, so it must never surface as an error to the user.
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      if (data && data.session) syncFromServer();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) syncFromServer();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

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
