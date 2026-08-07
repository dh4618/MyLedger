// A write-ahead copy of a stored blob, kept in localStorage, one entry per storage key.
//
// Writes are debounced before they go to the network, so there is a window in which a
// change exists only in memory. On an iPhone that window is easy to hit: tick the last
// thing on the list and immediately swipe the app away or lock the phone, and the write
// never happens. Nothing warns you, because from the app's point of view the tap
// succeeded. Adding a grocery item in a shop with one bar of signal is the same story.
//
// For days the loss is worse than it first looks. A keep-until-complete task's home day
// is derived from *where its completion is recorded*, so a lost tick doesn't just leave
// the task unticked on yesterday — it moves the task to today, where it reappears
// looking like it was never done.
//
// So every write is mirrored here synchronously, before the debounce, and the mirror is
// cleared only once the server confirms. A mirror still present at the next launch means
// the last write never landed, and it gets replayed.
const entryKey = (storageKey) => `ledger:unflushed:${storageKey}`;

// The mirror was keyed to days alone before it covered more than one blob. Anything
// stored under the old name is still a real unflushed write, so it is honoured once and
// then migrated. Safe to delete this once no installed app can still be holding one.
const LEGACY_DAYS_KEY = 'ledger:unflushed-days';

export const rememberUnflushed = (storageKey, userId, value) => {
  if (!userId) return;
  try {
    localStorage.setItem(entryKey(storageKey), JSON.stringify({ userId, savedAt: Date.now(), value }));
  } catch (e) {
    // Private mode, or the quota is full. The network write is still the main path;
    // this is a safety net, so failing to set it is not worth interrupting anyone for.
  }
};

export const clearUnflushed = (storageKey) => {
  try {
    localStorage.removeItem(entryKey(storageKey));
    if (storageKey === 'all-days') localStorage.removeItem(LEGACY_DAYS_KEY);
  } catch (e) { /* see above */ }
};

// The unflushed value for this key and account, or null. Anything belonging to a
// different user id is discarded rather than returned: signing in as someone else must
// never replay the previous account's data into theirs.
export const readUnflushed = (storageKey, userId) => {
  if (!userId) return null;
  const names = storageKey === 'all-days' ? [entryKey(storageKey), LEGACY_DAYS_KEY] : [entryKey(storageKey)];
  for (const name of names) {
    try {
      const raw = localStorage.getItem(name);
      if (!raw) continue;
      const entry = JSON.parse(raw);
      if (entry && typeof entry.value === 'string' && entry.userId === userId) return entry.value;
      localStorage.removeItem(name);
    } catch (e) {
      try { localStorage.removeItem(name); } catch (e2) { /* nothing left to try */ }
    }
  }
  return null;
};
