import React from 'react';
import { createRoot } from 'react-dom/client';
import './theme.css';
import { ThemeProvider } from './ThemeProvider';
import { LanguageProvider } from './i18n/LanguageProvider';
import Auth from './Auth';
import Ledger from './Ledger';

// Both providers sit outside Auth so the sign-in and loading screens are themed
// and translated too — they used to be the one place that always painted the
// light palette in English.
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <ThemeProvider>
        <Auth>
          <Ledger />
        </Auth>
      </ThemeProvider>
    </LanguageProvider>
  </React.StrictMode>
);

// An installed PWA with a service worker gets meaningfully better protection from
// WebKit evicting script-writable storage after a stretch of no use — and that
// storage is where the Supabase refresh token lives. It also means the app opens
// from the Home Screen without a network connection.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration fails on http:// origins and in some private modes. The app
      // works fine without it, so this is not worth surfacing.
    });
  });
}
