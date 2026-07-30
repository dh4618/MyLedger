import React from 'react';
import { useLang } from './i18n/LanguageProvider';

// Reuses the existing segmented control from the task form, so this needs no new
// CSS. Each label is written in its own language and is never translated — a
// language you can't currently read is exactly the one you're looking for.
export default function LanguagePicker() {
  const { langId, setLangId, languages } = useLang();

  return (
    <div className="dt-segmented">
      {languages.map((l) => (
        <button
          key={l.id}
          className={`dt-segmented-btn ${l.id === langId ? 'active' : ''}`}
          lang={l.id}
          onClick={() => setLangId(l.id)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
