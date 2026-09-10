// Turns a range of days into a per-goal report. Pure: no React, no storage, no Intl.
// Everything it needs about *what happened* arrives through `getTasksForDate`.
//
// That indirection is the whole design. Ledger's getTasksForDate already encodes every
// rule that decides whether a task was live on a day — weekly matching, the monthly
// short-month clamp, createdDate/endDate bounds, the per-day removedRecurring skip list,
// and carry-over tasks resolved onto their home day. Asking it, rather than re-deriving
// the schedule here, is what makes the report agree with what the day page actually
// showed. A second implementation would drift from the first, and the clamp and the skip
// list are exactly where it would drift silently.
//
// It also settles a judgement call for free: an occurrence you explicitly skipped is not
// a miss. removedRecurring means "not due that day", so it never reaches this file and
// the denominator shrinks instead of counting against you.

const NO_GOAL = '__no_goal__';

const foldName = (name) => String(name || '').trim().toLowerCase();

/**
 * @param dateStrs   ascending date keys to report on — already trimmed to today by the caller
 * @param getTasks   (dateStr) => tasks live on that day, Ledger's getTasksForDate
 * @param isDone     (dateStr, taskId) => was it ticked on that day
 * @param goals      the goal list, for names, colours and ordering
 * @param presets    preset templates, so an unused one still appears with a zero
 * @returns sections in goal order, goal-less last; empty sections are dropped
 */
export function buildReport({ dateStrs, getTasks, isDone, goals = [], presets = [] }) {
  // goalId -> { repeats: Map<taskId, {...}>, oneOffs: Map<foldedName, {...}> }
  const buckets = new Map();
  const known = new Set(goals.map((g) => g.id));
  // "Others" means "no goal we can find", not "goalId is null" — the same rule the day
  // page and Manage use, so a task whose goal was deleted lands somewhere reachable
  // instead of forming a second nameless section of its own.
  const bucket = (goalId) => {
    const key = goalId && known.has(goalId) ? goalId : NO_GOAL;
    if (!buckets.has(key)) buckets.set(key, { repeats: new Map(), oneOffs: new Map() });
    return buckets.get(key);
  };

  dateStrs.forEach((ds) => {
    getTasks(ds).forEach((task) => {
      const done = !!isDone(ds, task.id);
      if (task.isRecurring) {
        // One dot per day it was due, in date order. The task being here at all means
        // it was due — getTasks has already applied every rule that could exclude it.
        const b = bucket(task.goalId);
        let row = b.repeats.get(task.id);
        if (!row) {
          row = { id: task.id, name: task.name, time: task.time || null, dots: [], done: 0, due: 0 };
          b.repeats.set(task.id, row);
        }
        row.dots.push(done);
        row.due += 1;
        if (done) row.done += 1;
        return;
      }
      // On-demand work is counted, not scored: only completions land here. An instance
      // you put on a day and didn't do isn't a failure for something with no schedule,
      // and counting it would need a denominator that doesn't exist.
      if (!done) return;
      const b = bucket(task.goalId);
      const key = foldName(task.name);
      if (!key) return;
      const row = b.oneOffs.get(key) || { key, name: task.name, count: 0 };
      row.name = task.name;
      row.count += 1;
      b.oneOffs.set(key, row);
    });
  });

  // Presets with nothing in the period still list, at zero. A template is not a failure
  // for going unused, and dropping it loses the fact that it exists at all — the same
  // reasoning that keeps them visible under "Ready to add".
  presets.forEach((p) => {
    const key = foldName(p.name);
    if (!key) return;
    const b = bucket(p.goalId);
    const row = b.oneOffs.get(key);
    // The preset's own spelling is the canonical one — it is the name the user gave the
    // template — so it wins over however a particular day's instance happened to be typed.
    if (row) row.name = p.name;
    else b.oneOffs.set(key, { key, name: p.name, count: 0 });
  });

  const sectionFor = (goalId, name, color) => {
    const b = buckets.get(goalId || NO_GOAL);
    if (!b) return null;
    const repeats = [...b.repeats.values()].sort((a, x) => a.name.localeCompare(x.name));
    // Most-done first: the point of the list is which ones you actually got to.
    const oneOffs = [...b.oneOffs.values()].sort((a, x) => x.count - a.count || a.name.localeCompare(x.name));
    if (!repeats.length && !oneOffs.length) return null;
    const due = repeats.reduce((n, r) => n + r.due, 0);
    const done = repeats.reduce((n, r) => n + r.done, 0);
    return { goalId: goalId || null, name, color, repeats, oneOffs, done, due };
  };

  const sections = [];
  goals.forEach((g) => {
    const section = sectionFor(g.id, g.name, g.color);
    if (section) sections.push(section);
  });
  return { sections, others: sectionFor(null, null, null) };
}

// Whole percent, and never NaN: a task with no due days in the period reports 0, which
// the caller hides behind an em dash rather than printing "0%".
export const pct = (done, due) => (due > 0 ? Math.round((done / due) * 100) : 0);
