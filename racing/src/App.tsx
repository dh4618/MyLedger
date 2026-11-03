import { useEffect, useRef, type ReactNode } from 'react';
import { BrowserRouter, Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { RaceListPage } from './pages/RaceListPage';
import { RacePage } from './pages/RacePage';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

const FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };

/**
 * The single-file preview build (`npm run build:preview`) runs where only a plain `#name`
 * survives in a shared link, so there the race id itself is the hash: `#kempton-2026-11-04-1740`.
 * Normal builds use real paths (`/race/kempton-2026-11-04-1740`).
 */
const PLAIN_HASH = import.meta.env.MODE === 'preview';

function hashToPath(hash: string): string {
  const id = hash.replace(/^#/, '');
  return id ? `/race/${id}` : '/';
}

/** Keeps the in-memory route and `location.hash` in step, both ways (so Back works). */
function PlainHashSync() {
  const location = useLocation();
  const navigate = useNavigate();
  const current = useRef(location.pathname);
  current.current = location.pathname;

  useEffect(() => {
    const m = location.pathname.match(/^\/race\/(.+)$/);
    const want = m ? `#${m[1]}` : '';
    if (window.location.hash !== want && !(want === '' && window.location.hash === '#')) window.location.hash = want;
  }, [location.pathname]);

  useEffect(() => {
    const onHash = () => {
      const path = hashToPath(window.location.hash);
      if (path !== current.current) navigate(path);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [navigate]);
  return null;
}

function Router({ children }: { children: ReactNode }) {
  if (PLAIN_HASH) {
    return (
      <MemoryRouter initialEntries={[hashToPath(window.location.hash)]} future={FUTURE}>
        <PlainHashSync />
        {children}
      </MemoryRouter>
    );
  }
  return <BrowserRouter future={FUTURE}>{children}</BrowserRouter>;
}

export function App() {
  return (
    <Router>
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
    </Router>
  );
}
