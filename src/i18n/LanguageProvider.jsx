import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { usePersistedPreference } from '../usePersistedPreference';
import { LANGUAGES, LANGUAGE_IDS, DEFAULT_LANGUAGE_ID, getLanguage, en } from './strings';

// Must match the key used by the pre-React script in index.html.
const LOCAL_KEY = 'ledger-lang';
const KV_KEY = 'lang';

const LanguageContext = createContext(null);

const isValidLang = (id) => typeof id === 'string' && LANGUAGE_IDS.includes(id);

// First run only, when nothing is stored on the device or the account: take the
// hint from the browser rather than forcing English on a Chinese device. An
// explicit choice always wins afterwards, because it gets written to both stores.
function detectLang() {
  try {
    const candidates = navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language];
    for (const tag of candidates) {
      if (!tag) continue;
      // Any Chinese tag maps to Simplified for now. When Traditional is added,
      // match zh-Hant / zh-TW / zh-HK ahead of this.
      if (/^zh\b/i.test(tag)) return 'zh-CN';
      if (/^en\b/i.test(tag)) return 'en';
    }
  } catch (e) {
    // No navigator (or a hostile one); fall through to the default.
  }
  return DEFAULT_LANGUAGE_ID;
}

function applyLang(id) {
  // Set on <html> so the browser can pick the right CJK glyph variants and so
  // assistive tech announces the content in the right language.
  document.documentElement.setAttribute('lang', id);
}

// Whatever index.html already applied, so the first render agrees with it.
const readAppliedLang = () => document.documentElement.getAttribute('lang');

// Substitutes {name} placeholders. Values are inserted verbatim — these all end
// up as React text children, never as HTML, so there's nothing to escape.
function interpolate(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key) => (
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : whole
  ));
}

export function LanguageProvider({ children }) {
  const [langId, setLangId] = usePersistedPreference({
    localKey: LOCAL_KEY,
    kvKey: KV_KEY,
    isValid: isValidLang,
    fallback: detectLang(),
    readInitial: readAppliedLang,
    apply: applyLang,
  });

  const language = getLanguage(langId);

  // Falls back to English, then to the key itself. A missing translation should
  // degrade to readable English rather than a blank space or a raw key on screen.
  const t = useCallback((key, vars) => {
    const table = getLanguage(langId).strings;
    const template = table[key] !== undefined ? table[key] : en[key];
    if (template === undefined) {
      if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${key}`);
      return key;
    }
    return interpolate(template, vars);
  }, [langId]);

  // Comma-separated lists in the dictionary (weekday letters and abbreviations)
  // split into arrays once per language rather than on every render.
  const lists = useMemo(() => {
    const table = getLanguage(langId).strings;
    return {
      weekdayLetters: (table['days.letters'] || en['days.letters']).split(','),
      weekdayAbbr: (table['days.abbr'] || en['days.abbr']).split(','),
    };
  }, [langId]);

  const value = useMemo(() => ({
    t,
    langId,
    setLangId,
    language,
    locale: language.locale,
    languages: LANGUAGES,
    ...lists,
  }), [t, langId, setLangId, language, lists]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLang must be used inside a LanguageProvider');
  return ctx;
}
