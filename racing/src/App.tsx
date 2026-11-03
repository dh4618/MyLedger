import { useEffect } from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { RaceListPage } from './pages/RaceListPage';
import { RacePage } from './pages/RacePage';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ScrollToTop />
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true">◆</span> Racecard Research
        </Link>
        <span className="topbar-note">Private prototype</span>
      </header>
      <main className="page">
        <Routes>
          <Route path="/" element={<RaceListPage />} />
          <Route path="/race/:raceId" element={<RacePage />} />
          <Route path="*" element={<p>Page not found. <Link to="/">Back to racecards</Link></p>} />
        </Routes>
      </main>
      <footer className="footer">
        <p>
          <strong>18+</strong> · Research tool only: we do not take bets or hold funds. Win chances are estimates and past performance does not
          guarantee future results.
        </p>
        <p>
          Gambling should be fun. If it isn’t, get free, confidential support at{' '}
          <a href="https://www.begambleaware.org" target="_blank" rel="noreferrer">
            BeGambleAware.org
          </a>{' '}
          or call the National Gambling Helpline on 0808 8020 133.
        </p>
      </footer>
    </BrowserRouter>
  );
}
