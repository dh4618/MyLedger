import { genId } from './ids';

// The groceries list is the one thing in the app that isn't anchored to a date. It just
// accumulates until you go to the shop, which is why it gets its own `kv` key rather
// than being bent into days or goals: a dozen grocery items filed under a day would bury
// the three things you actually planned to do, and count against the day's progress.
//
// Shape:
//   { items: [{ id, name, bought, addedAt }], recent: ['Milk', …] }
//
// `recent` is what you last cleared, newest first — the "buy again" chips, so weekly
// staples are one tap rather than retyped.

export const RECENT_LIMIT = 12;

export const emptyGroceries = () => ({ items: [], recent: [] });

// Matching is on the trimmed, case-folded name: "Milk" and "milk " are the same thing to
// anyone writing a shopping list.
export const sameItem = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

// Everything read from storage or a restored backup goes through this, so a hand-edited
// or older file can't put the sheet into a shape it doesn't expect.
export const normalizeGroceries = (raw) => ({
  items: Array.isArray(raw && raw.items)
    ? raw.items
        .filter((x) => x && typeof x.name === 'string' && x.name.trim())
        .map((x) => ({ id: x.id || genId(), name: x.name, bought: !!x.bought, addedAt: x.addedAt || null }))
    : [],
  recent: Array.isArray(raw && raw.recent)
    ? raw.recent.filter((x) => typeof x === 'string' && x.trim()).slice(0, RECENT_LIMIT)
    : [],
});

// Returns { next, id }, or null when there is nothing to add. `id` is the row to flash,
// which is how a duplicate tells you "it's already there" instead of silently no-oping.
export const addItem = (list, rawName) => {
  const name = String(rawName).trim();
  if (!name) return null;

  const existing = list.items.find((x) => sameItem(x.name, name));
  if (existing) {
    // Already outstanding: don't add a second identical line. Already bought: you have
    // decided you need it again, so un-tick it and lift it back to the top — which is
    // what you meant, and better than two rows with the same word on them.
    if (!existing.bought) return { next: list, id: existing.id };
    return {
      next: {
        ...list,
        items: [
          { ...existing, bought: false, addedAt: new Date().toISOString() },
          ...list.items.filter((x) => x.id !== existing.id),
        ],
      },
      id: existing.id,
    };
  }

  // Newest first: capture is the main thing this list does, so what you just typed has
  // to be visible without scrolling. Existing rows never reorder, they only shift down.
  const item = { id: genId(), name, bought: false, addedAt: new Date().toISOString() };
  return { next: { ...list, items: [item, ...list.items] }, id: item.id };
};

export const toggleItem = (list, id) => ({
  ...list,
  items: list.items.map((x) => (x.id === id ? { ...x, bought: !x.bought } : x)),
});

export const removeItem = (list, id) => ({
  ...list,
  items: list.items.filter((x) => x.id !== id),
});

// Drops the bought items and remembers their names. Newly cleared names go to the front
// of "buy again"; the oldest fall off the end.
export const clearBought = (list) => {
  const bought = list.items.filter((x) => x.bought);
  if (!bought.length) return list;
  const recent = [...bought.map((x) => x.name), ...list.recent]
    .filter((name, i, all) => all.findIndex((other) => sameItem(other, name)) === i)
    .slice(0, RECENT_LIMIT);
  return { items: list.items.filter((x) => !x.bought), recent };
};

// What to offer as chips: things you have bought before and don't already have listed.
export const suggestionsFor = (list) =>
  list.recent.filter((name) => !list.items.some((x) => sameItem(x.name, name)));
