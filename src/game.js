// The hatchery's rules. Pure: no React, no storage, no randomness it doesn't own.
//
// The game reads the task log and never writes to it. Completing a task is the only
// thing that earns anything, and nothing here can tick a task on your behalf — the
// report and the streak stay true whatever happens in here.

import { SPECIES_IDS } from './pixels.js';

export const EGG_PRICE = 10;

// 5 tasks to hatch, 10 more to young adult, 15 more to adult: 30 for a full creature.
// Each stage asks for more than the last, so later growth is actually earned.
export const STAGE_STEPS = [5, 10, 15];
export const STAGE_AT = [0, 5, 15, 30];            // cumulative progress per stage
const STAGE_NAMES = ['egg', 'kid', 'young', 'adult'];

export const emptyGame = () => ({
  // The completed-task count when the hatchery first ran. Stars are earned above this
  // line, which is how "start from zero now" works with no migration and no backfill.
  baseline: null,
  spent: 0,
  eggs: [],       // { id, species: null until opened }
  creatures: [],  // { id, species, progress }
  activeId: null, // the one egg or creature receiving task progress
  activeFrom: 0,  // the completed-task count when it entered the slot
});

export function normalizeGame(raw) {
  const g = { ...emptyGame(), ...(raw && typeof raw === 'object' ? raw : {}) };
  const withProgress = (x) => ({ ...x, progress: Number.isFinite(x.progress) ? x.progress : 0 });
  g.eggs = (Array.isArray(g.eggs) ? g.eggs : []).map(withProgress);
  g.creatures = (Array.isArray(g.creatures) ? g.creatures : []).map(withProgress);
  g.spent = Number.isFinite(g.spent) ? g.spent : 0;
  g.activeFrom = Number.isFinite(g.activeFrom) ? g.activeFrom : 0;
  return g;
}

// Values, not keys. Unticking writes completed[id] = false rather than deleting the
// entry, so counting keys would pay you for work you undid — the trap the streak hit.
export function totalCompleted(days) {
  let n = 0;
  Object.keys(days || {}).forEach((ds) => {
    const c = (days[ds] || {}).completed || {};
    Object.keys(c).forEach((id) => { if (c[id]) n += 1; });
  });
  return n;
}

// Derived, never banked: anything recomputable from `days` is not state.
export function stars(game, total) {
  const g = normalizeGame(game);
  const baseline = Number.isFinite(g.baseline) ? g.baseline : total;
  const earned = Math.max(0, total - baseline);
  return { earned, spent: g.spent, balance: Math.max(0, earned - g.spent) };
}

export const stageOf = (progress) => {
  let i = 0;
  while (i + 1 < STAGE_AT.length && progress >= STAGE_AT[i + 1]) i += 1;
  return STAGE_NAMES[i];
};

export const isFullyGrown = (progress) => progress >= STAGE_AT[STAGE_AT.length - 1];

// What the next stage costs and how far along this one is. Returns null once grown,
// which is what frees the slot.
export function nextStage(progress) {
  for (let i = 0; i + 1 < STAGE_AT.length; i += 1) {
    if (progress < STAGE_AT[i + 1]) {
      return { into: STAGE_NAMES[i + 1], from: STAGE_AT[i], to: STAGE_AT[i + 1], done: progress - STAGE_AT[i], need: STAGE_AT[i + 1] - STAGE_AT[i] };
    }
  }
  return null;
}

// Live progress of whatever is in the slot. Banked progress plus everything completed
// since it entered, so swapping in and out can neither double-count nor lose a task.
export const liveProgress = (entry, game, total) => (
  !entry ? 0 : (entry.progress || 0) + (game.activeId === entry.id ? Math.max(0, total - game.activeFrom) : 0)
);

export function activeEntry(game) {
  const g = normalizeGame(game);
  if (!g.activeId) return null;
  return g.creatures.find((c) => c.id === g.activeId) || g.eggs.find((e) => e.id === g.activeId) || null;
}

// ---- reducers: each returns a new game, or null when the action isn't allowed ----

export function buyEgg(game, total, newId) {
  const g = normalizeGame(game);
  const { balance } = stars(g, total);
  if (balance < EGG_PRICE) return null;
  return { ...g, spent: g.spent + EGG_PRICE, eggs: [...g.eggs, { id: newId, species: null, progress: 0 }] };
}

// Rolled once and written down. A collection that re-rolled on render would be
// worthless, so `pick` is called here and the result is stored, never re-derived.
export function openEgg(game, eggId, pick) {
  const g = normalizeGame(game);
  const egg = g.eggs.find((e) => e.id === eggId);
  if (!egg || egg.species) return null;
  const species = SPECIES_IDS[Math.abs(pick) % SPECIES_IDS.length];
  return { ...g, eggs: g.eggs.map((e) => (e.id === eggId ? { ...e, species } : e)) };
}

// Banks the active entry's live progress before anything else moves, so the slot can
// be emptied or swapped without losing a task.
function bank(g, total) {
  if (!g.activeId) return g;
  const apply = (x) => (x.id === g.activeId ? { ...x, progress: liveProgress(x, g, total) } : x);
  return { ...g, eggs: g.eggs.map(apply), creatures: g.creatures.map(apply), activeId: null, activeFrom: 0 };
}

export const bankActive = (game, total) => bank(normalizeGame(game), total);

// Starting something is deliberate, and only one thing can be in the slot: while an
// egg is being hatched — or a creature raised — nothing else can enter.
export function startIncubating(game, id, total) {
  const g = normalizeGame(game);
  if (g.activeId) return null;
  const target = g.eggs.find((e) => e.id === id) || g.creatures.find((c) => c.id === id);
  if (!target || !target.species) return null;
  if (isFullyGrown(target.progress || 0)) return null;
  return { ...g, activeId: id, activeFrom: total };
}

// Expects a normalized game, and returns it unchanged — same reference — when there
// is nothing to do, so callers can use identity to decide whether to persist.
//
// An egg that reaches its first threshold becomes a creature. It stays in the slot:
// raising it to adult is the same queue as hatching, or "one at a time" would quietly
// stop applying the moment something hatched.
export function settle(game, total) {
  const g = game;
  let next = g;
  const active = activeEntry(next);
  if (active && next.eggs.some((e) => e.id === active.id)) {
    const progress = liveProgress(active, next, total);
    if (progress >= STAGE_AT[1]) {
      next = {
        ...next,
        eggs: next.eggs.filter((e) => e.id !== active.id),
        creatures: [...next.creatures, { id: active.id, species: active.species, progress: active.progress || 0 }],
        activeFrom: next.activeFrom,
      };
    }
  }
  // A grown creature releases the slot rather than sitting in it earning nothing.
  const current = activeEntry(next);
  if (current && isFullyGrown(liveProgress(current, next, total))) next = bank(next, total);
  return next === g ? g : next;
}

// Everything you own, most advanced first — the collection view, and the source of the
// app's face when nothing is being raised.
export function collection(game, total) {
  const g = normalizeGame(game);
  const rows = [
    ...g.creatures.map((c) => ({ ...c, kind: 'creature', live: liveProgress(c, g, total) })),
    ...g.eggs.map((e) => ({ ...e, progress: e.progress || 0, kind: 'egg', live: liveProgress({ ...e, progress: e.progress || 0 }, g, total) })),
  ];
  rows.forEach((r) => { r.stage = r.species ? stageOf(r.live) : 'egg'; });
  return rows.sort((a, b) => b.live - a.live);
}
