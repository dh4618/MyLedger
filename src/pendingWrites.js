// A write-ahead copy of the day blob, kept in localStorage.
//
// Day writes are debounced by 600ms and then go out over the network, so there is a
// window in which a tick exists only in memory. On an iPhone that window is easy to
// hit: tick the last thing on the list and immediately swipe the app away or lock the
// phone, and the write never happens. Nothing warns you, because from the app's point
// of view the tap succeeded.
//
// The loss is worse than it first looks. A keep-until-complete task's home day is
// derived from *where its completion is recorded*, so a lost tick doesn't just leave
// the task unticked on yesterday — it moves the task to today, where it reappears
// looking like it was never done.
//
// So every day write is mirrored here synchronously, before the debounce, and the
// mirror is cleared only once the server confirms the write. A mirror still present at
// the next launch means the last write never landed, and it gets replayed.
const KEY = 'ledger:unflushed-days';

export const rememberUnflushed = (userId, value) => {
  if (!userId) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ userId, savedAt: Date.now(), value }));
  } catch (e) {
    // Private mode, or the quota is full. The network write is still the main path;
    // this is a safety net, so failing to set it is not worth interrupting anyone for.
  }
};

export const clearUnflushed = () => {
  try { localStorage.removeItem(KEY); } catch (e) { /* see above */ }
};

// The unflushed value for this account, or null. Anything belonging to a different
// user id is discarded rather than returned: signing in as someone else must never
// replay the previous account's data into theirs.
export const readUnflushed = (userId) => {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || typeof entry.value !== 'string' || entry.userId !== userId) {
      clearUnflushed();
      return null;
    }
    return entry.value;
  } catch (e) {
    clearUnflushed();
    return null;
  }
};
