import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { storage } from './storage';

// A user preference stored in two places, on purpose:
//
//   localStorage — read synchronously by the inline script in index.html before
//     React boots, so the very first paint is already correct. Without it the app
//     flashes the default on every launch.
//   kv (Supabase) — the durable, per-account copy, so a new device or a cleared
//     browser picks the preference back up after signing in.
//
// localStorage wins at startup; the account value is reconciled in once a session
// exists. Both the theme and the language use this — it was extracted from
// ThemeProvider rather than copied, because the auth-sync timing below is subtle
// enough that two versions of it would drift.
//
//   localKey  — localStorage key (must match index.html)
//   kvKey     — key in the Supabase kv table
//   isValid   — guards against stale or hand-edited values
//   fallback  — used when nothing valid is stored anywhere
//   readInitial — optional; reads whatever the inline script already applied to
//                 the document, so the first render agrees with the paint that
//                 has already happened
//   apply     — side effects for a value (set an attribute, a meta tag, …). Also
//               responsible for nothing else; the hook handles localStorage.
export function usePersistedPreference({ localKey, kvKey, isValid, fallback, readInitial, apply }) {
  const initial = () => {
    if (readInitial) {
      const applied = readInitial();
      if (isValid(applied)) return applied;
    }
    try {
      const saved = window.localStorage.getItem(localKey);
      if (isValid(saved)) return saved;
    } catch (e) {
      // Storage can be unavailable in private browsing; the fallback is fine.
    }
    return fallback;
  };

  const [value, setValueState] = useState(initial);

  // Lets the async server sync compare against the live value without becoming a
  // dependency of the effect that runs it.
  const valueRef = useRef(value);
  valueRef.current = value;

  const persistLocal = useCallback((next) => {
    try {
      window.localStorage.setItem(localKey, next);
    } catch (e) {
      // Non-fatal: the account copy in kv is the durable one.
    }
  }, [localKey]);

  const applyRef = useRef(apply);
  applyRef.current = apply;

  // Re-assert on mount so the document is correct even if the inline script was
  // blocked or the stored value was stale.
  useEffect(() => {
    if (applyRef.current) applyRef.current(valueRef.current);
    persistLocal(valueRef.current);
  }, [persistLocal]);

  const setValue = useCallback((next) => {
    if (!isValid(next) || next === valueRef.current) return;
    setValueState(next);
    if (applyRef.current) applyRef.current(next);
    persistLocal(next);
    // Best effort: localStorage already has it, so a failed write here only means
    // this choice won't follow you to another device yet.
    Promise.resolve(storage.set(kvKey, next)).catch(() => {});
  }, [isValid, kvKey, persistLocal]);

  useEffect(() => {
    let cancelled = false;

    const syncFromServer = async () => {
      try {
        const row = await storage.get(kvKey);
        if (cancelled) return;
        const remote = row && row.value;
        if (isValid(remote)) {
          if (remote !== valueRef.current) {
            setValueState(remote);
            if (applyRef.current) applyRef.current(remote);
            persistLocal(remote);
          }
        } else if (valueRef.current !== fallback) {
          // Nothing saved on the account yet, but this device has a preference —
          // seed the account so other devices inherit the choice.
          await storage.set(kvKey, valueRef.current);
        }
      } catch (e) {
        // Offline, signed out, or the read failed. The local value stands; these
        // are cosmetic preferences, so this must never surface as an error.
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
  }, [kvKey, isValid, fallback, persistLocal]);

  return [value, setValue];
}
