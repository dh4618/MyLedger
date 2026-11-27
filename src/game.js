// The hatchery's rules. Pure: no React, no storage, no randomness it doesn't own.
//
// The game reads the task log and never writes to it. Completing a task is the only
// thing that earns anything, and nothing here can tick a task on your behalf — the
// report and the streak stay true whatever happens in here.

import { SPECIES_IDS } from './pixels.js';

// TESTING VALUE. The real price is 10 stars — enough that the first egg is something
// you work towards, which is what makes buying one worth anything. Turned down to 1 so
// the loop can be walked end to end in a handful of taps. Put it back, along with
// STAGE_STEPS below, before this is used for real.
export const EGG_PRICE = 1;

// What each stage costs: to hatch, then to young adult, then to adult.
//
// TESTING VALUE. The real pacing is [5, 10, 15] — 30 tasks for a full creature, each
// stage asking more than the last so later growth is actually earned. This is turned
// down to walk the whole loop in a few taps; put it back before shipping for real.
export const STAGE_STEPS = [1, 1, 1];

// Cumulative, derived rather than written out a second time: these two used to be
// separate hand-written lists, so changing the pacing in one left the other quietly
// disagreeing about where a stage begins.
export const STAGE_AT = STAGE_STEPS.reduce((acc, step) => [...acc, acc[acc.length - 1] + step], [0]);
const STAGE_NAMES = ['egg', 'kid', 'young', 'adult'];

export const emptyGame = () => ({
  // The completed-task count when the hatchery first ran. Stars are earned above this
  // line, which is how "start from zero now" works with no migration and no backfill.
  baseline: null,
  spent: 0,
  eggs: [],       // { id, species: null until opened, progress }
  creatures: [],  // { id, species, progress }
  activeId: null, // the one egg or creature you are raising, and the one food goes to
  // The picture pinned as the app's icon: { species, stage }, or null to follow
  // whatever is being raised. The only genuinely new state the album needs — which
  // pictures you own is implied by how far your creatures have got.
  icon: null,
});

export function normalizeGame(raw) {
  const g = { ...emptyGame(), ...(raw && typeof raw === 'object' ? raw : {}) };
  const withProgress = (x) => ({ ...x, progress: Number.isFinite(x.progress) ? x.progress : 0 });
  g.eggs = (Array.isArray(g.eggs) ? g.eggs : []).map(withProgress);
  g.creatures = (Array.isArray(g.creatures) ? g.creatures : []).map(withProgress);
  g.spent = Number.isFinite(g.spent) ? g.spent : 0;
  // `activeFrom` is deliberately not defaulted here. Growth used to accrue from the
  // task count while something sat in the slot, and that field was where the count
  // stood when it entered. Feeding replaced it, and its absence from emptyGame is what
  // lets migrate() below tell an old save from a new one — see there.
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

// How far along something is. Nothing live about it any more: growth is fed, so what
// an entry has eaten is all there is. This used to add everything completed since the
// entry took the slot, which meant progress arrived by itself and the slot was the
// only thing you ever chose.
export const progressOf = (entry) => (entry ? entry.progress || 0 : 0);

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

// Putting something down just empties the slot. There is nothing to bank: feeding
// writes progress the moment it happens, so what an entry has eaten is already on it
// whether or not it is the one being raised.
export const putDown = (game) => ({ ...normalizeGame(game), activeId: null });

// Starting something is deliberate, and only one thing can be in the slot: while an
// egg is being hatched — or a creature raised — nothing else can enter.
export function startIncubating(game, id) {
  const g = normalizeGame(game);
  if (g.activeId) return null;
  const target = g.eggs.find((e) => e.id === id) || g.creatures.find((c) => c.id === id);
  if (!target || !target.species) return null;
  if (isFullyGrown(target.progress || 0)) return null;
  return { ...g, activeId: id };
}

// What one meal costs. A star buys a step of growth, which is the whole economy: the
// day's work becomes stars, and stars become either a new egg or a bigger creature.
export const FEED_COST = 1;

// Feed the thing in the slot. This is the only way anything grows.
//
// Completing a task used to grow your pet by itself, which made the whole hatchery
// something that happened to you rather than something you did. Now a task earns a
// star, and you choose what to spend it on.
//
// Returns null when there is nothing to feed, nothing to feed it with, or it is
// already grown — so the caller can leave the button disabled for exactly the reasons
// this refuses.
export function feed(game, total, id) {
  const g = normalizeGame(game);
  const targetId = id || g.activeId;
  if (!targetId) return null;
  const entry = g.creatures.find((c) => c.id === targetId) || g.eggs.find((e) => e.id === targetId);
  if (!entry || !entry.species) return null;
  if (isFullyGrown(progressOf(entry))) return null;
  if (stars(g, total).balance < FEED_COST) return null;
  const grow = (x) => (x.id === targetId ? { ...x, progress: progressOf(x) + 1 } : x);
  return settle({
    ...g,
    spent: g.spent + FEED_COST,
    eggs: g.eggs.map(grow),
    creatures: g.creatures.map(grow),
  });
}

// Expects a normalized game, and returns it unchanged — same reference — when there
// is nothing to do, so callers can use identity to decide whether to persist.
//
// An egg that reaches its first threshold becomes a creature. It stays in the slot:
// raising it to adult is the same queue as hatching, or "one at a time" would quietly
// stop applying the moment something hatched.
export function settle(game) {
  const g = game;
  let next = g;
  const hatched = next.eggs.filter((e) => e.species && progressOf(e) >= STAGE_AT[1]);
  if (hatched.length) {
    next = {
      ...next,
      eggs: next.eggs.filter((e) => !hatched.includes(e)),
      creatures: [...next.creatures, ...hatched.map((e) => ({ id: e.id, species: e.species, progress: progressOf(e) }))],
    };
  }
  // A grown creature releases the slot rather than sitting in it eating nothing.
  const current = activeEntry(next);
  if (current && isFullyGrown(progressOf(current))) next = { ...next, activeId: null };
  return next === g ? g : next;
}

// One-time, for saves written while growth still came from completing tasks: fold what
// the old rules had accrued into banked progress, so nobody loses a pet's worth of
// growth to the change. Stars are untouched — none were ever spent on growing.
//
// `activeFrom` is the marker. It was in every old save and is in no new one, and
// normalizeGame deliberately does not default it, so its presence is the question
// "has this save been through here yet".
//
// Like settle, it expects an already-normalized game and returns that same reference
// when there is nothing to do. Minting a new object on every call is what turned the
// caller's "persist if it changed" into an infinite render loop once before.
export function migrate(g, total) {
  if (!Number.isFinite(g.activeFrom)) return g;
  const gained = g.activeId ? Math.max(0, total - g.activeFrom) : 0;
  const grow = (x) => (x.id === g.activeId ? { ...x, progress: progressOf(x) + gained } : x);
  const next = { ...g, eggs: g.eggs.map(grow), creatures: g.creatures.map(grow) };
  delete next.activeFrom;
  return settle(next);
}

// Everything you own, most advanced first — the collection view, and the source of the
// app's face when nothing is being raised.
// These no longer take the completed-task count. They used to, because progress was
// partly a function of it; now progress is on the entry and nothing here depends on
// the log at all. A `total` they quietly ignored would say the opposite.
export function collection(game) {
  const g = normalizeGame(game);
  const rows = [
    ...g.creatures.map((c) => ({ ...c, kind: 'creature', progress: progressOf(c) })),
    ...g.eggs.map((e) => ({ ...e, kind: 'egg', progress: progressOf(e) })),
  ];
  rows.forEach((r) => { r.stage = r.species ? stageOf(r.progress) : 'egg'; });
  return rows.sort((a, b) => b.progress - a.progress);
}

// Which species you can put a name to.
//
// Opening an egg tells you which creature is inside, but it doesn't tell *you*: the
// name is the payoff for hatching it, so until one of a species has been out of its
// shell the app shows ??? in place of the name. Once one has hatched the species is
// named for good — it is the same animal either way, so a second fox egg has nothing
// left to hide.
//
// Derived, like everything else here: progress only goes up, so "has one of these ever
// hatched" is just "is any of them past the egg stage".
export function knownSpecies(game) {
  const known = new Set();
  collection(normalizeGame(game)).forEach((row) => {
    if (row.species && row.stage !== 'egg') known.add(row.species);
  });
  return known;
}

// ---- the album ----

// Every picture you have collected, grouped by species.
//
// It needs no stored state of its own: progress only ever goes up, so the stages a
// creature has passed through are implied by where it is now. A young adult fox has
// been an egg and a kid; an opened egg that hasn't hatched yet is just an egg; an
// unopened one contributes nothing, because you don't know what it is.
//
// Two creatures of the same species contribute to the same row rather than appearing
// twice — a picture is a picture, however many of that animal you have raised.
export function album(game) {
  const g = normalizeGame(game);
  const bySpecies = new Map();
  collection(g).forEach((row) => {
    if (!row.species) return;
    const reached = STAGE_NAMES.indexOf(row.stage);
    if (reached < 0) return;
    const seen = bySpecies.get(row.species) || new Set();
    for (let i = 0; i <= reached; i += 1) seen.add(STAGE_NAMES[i]);
    bySpecies.set(row.species, seen);
  });
  // Species in sprite-sheet order, stages in growth order, so the album reads the same
  // way every time rather than reshuffling as creatures overtake one another.
  return SPECIES_IDS
    .filter((species) => bySpecies.has(species))
    .map((species) => ({
      species,
      stages: STAGE_NAMES.filter((stage) => bySpecies.get(species).has(stage)),
    }));
}

export const hasPicture = (game, species, stage) =>
  album(game).some((row) => row.species === species && row.stages.includes(stage));

// Pinning is an override, so it needs an undo: without one, the automatic behaviour
// becomes unreachable the moment you pin for the first time.
export function pinIcon(game, species, stage) {
  const g = normalizeGame(game);
  if (!hasPicture(g, species, stage)) return null;
  return { ...g, icon: { species, stage } };
}

export const clearIcon = (game) => ({ ...normalizeGame(game), icon: null });

export const isPinned = (game, species, stage) => {
  const icon = normalizeGame(game).icon;
  return !!icon && icon.species === species && icon.stage === stage;
};

// What the app draws as its face: the picture you pinned, or nothing — in which case
// the caller shows the generic egg.
//
// It used to fall back to whatever you were raising, which meant the icon changed under
// you every time a creature grew. Pinning is the only thing that sets it now, so the
// icon stays put until you say otherwise.
//
// The pin is checked against the album rather than trusted: a pin naming a picture you
// do not own gives the generic egg instead of a creature you never raised. Nothing in
// the app can produce that today, but a hand-edited blob can.
export function iconFor(game) {
  const g = normalizeGame(game);
  if (g.icon && hasPicture(g, g.icon.species, g.icon.stage)) return g.icon;
  return null;
}

// Who is in the pet space. Hatched creatures wander; an opened egg that hasn't hatched
// sits there too, because an empty room while you are actively incubating something
// would be a strange thing to show. Unopened eggs stay out of it — you don't know what
// is in them yet.
//
// Avalanche mix (murmur3's finalizer). A plain `h * 31 + char` hash is not enough here:
// genId() is a timestamp plus a short random suffix, so two creatures bought in the same
// session differ in one or two characters — and with a weak hash their positions landed
// within a couple of percent of each other and the room looked like one stacked pile.
// This spreads a one-character difference across the whole range.
const mix = (n) => {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
};

// Each quantity a caller needs — where it stands, how far it roams, how fast — comes
// from its own re-mix of the seed, so they vary independently instead of moving together.
export const seedAt = (seed, index) => mix(seed + index * 0x9e3779b9);

// `seed` is derived from the id so a resident keeps its spot and its gait across
// re-renders instead of leaping about whenever React repaints.
export function residents(game) {
  const g = normalizeGame(game);
  return collection(g)
    .filter((row) => row.species)
    .map((row) => ({
      id: row.id,
      species: row.species,
      stage: row.stage,
      walks: row.kind === 'creature',
      isActive: g.activeId === row.id,
      seed: mix([...String(row.id)].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261)),
    }));
}
