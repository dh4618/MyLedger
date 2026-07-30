import React from 'react';
import { createRoot } from 'react-dom/client';
import './theme.css';
import { ThemeProvider } from './ThemeProvider';
import Auth from './Auth';
import Ledger from './Ledger';

// ThemeProvider sits outside Auth so the sign-in and loading screens are themed
// too — they used to be the one place that always painted the light palette.
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <Auth>
        <Ledger />
      </Auth>
    </ThemeProvider>
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
