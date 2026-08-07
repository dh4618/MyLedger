import { useCallback, useEffect, useRef } from 'react';
import { knownUserId } from './storage';
import { rememberUnflushed, clearUnflushed } from './pendingWrites';

// Rapid ticking shouldn't mean a request per tap, but nothing should sit unsent long
// enough to be worth losing either.
const FLUSH_DELAY = 600;

// A JSON blob in `kv` that survives the app being closed.
//
// Three things have to hold together, which is why they live in one hook rather than
// being repeated per key:
//
//   1. The value is mirrored to localStorage *synchronously*, ahead of the debounce, so
//      a change exists somewhere durable the instant it is made.
//   2. The mirror is cleared only once the server confirms the write. One still present
//      at the next launch means the write never landed — the caller replays it.
//   3. The pending write is flushed when the app goes away. `visibilitychange` is the
//      event that matters: an installed iOS web app essentially never fires
//      `beforeunload`, and switching apps, locking the phone and swiping away all skip
//      it. `visibilitychange` fires while the page is still alive, so the request has
//      time to finish instead of being abandoned mid-flight.
//
// `persist` and `locked` come from the component because they carry its error reporting
// and its "a load failed, don't overwrite good data" latch. Both are held in refs so a
// re-render doesn't churn the listeners.
export default function useDurableBlob({ storageKey, label, persist, locked }) {
  const latest = useRef(null);
  const timer = useRef(null);
  const persistRef = useRef(persist);
  useEffect(() => { persistRef.current = persist; });

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (latest.current === null) return false;
    const ok = await persistRef.current(storageKey, JSON.stringify(latest.current), label);
    // Only safe to drop the local copy once the server has actually taken the write.
    if (ok) clearUnflushed(storageKey);
    return ok;
  }, [storageKey, label]);

  const save = useCallback((next) => {
    latest.current = next;
    rememberUnflushed(storageKey, knownUserId(), JSON.stringify(next));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { flush(); }, FLUSH_DELAY);
  }, [storageKey, flush]);

  // Take a value as the current one without scheduling a write — for the load path and
  // for restoring a backup, where the value either came from the server or is about to
  // be sent explicitly.
  const adopt = useCallback((next) => { latest.current = next; }, []);
  const peek = useCallback(() => latest.current, []);
  const pending = useCallback(() => !!timer.current, []);

  useEffect(() => {
    const flushNow = () => {
      if (timer.current && !(locked && locked.current)) flush();
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flushNow(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flushNow);
    window.addEventListener('beforeunload', flushNow); // desktop tab close
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flushNow);
      window.removeEventListener('beforeunload', flushNow);
    };
  }, [flush, locked]);

  return { save, flush, adopt, peek, pending };
}
