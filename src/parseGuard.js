// Everything the model proposes passes through here before it is shown, let alone
// written. The model is given real ids and told to use only those, but "told to" is not a
// guarantee: an invented goalId, a task id it half-remembered, a date it made up, all
// arrive looking exactly like valid output. So nothing here trusts the payload — every id
// is re-checked against live data and every value against its own format.
//
// These are pure functions of (proposal, context) so they can be tested directly, without
// a browser or a model, which is where most of the value is.

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

// A capture is about now, so a date years out is a parse failure rather than a plan.
const PAST_DAYS = 366;
const FUTURE_DAYS = 730;

const asArray = (v) => (Array.isArray(v) ? v : []);
const asString = (v) => (typeof v === 'string' ? v.trim() : '');

const shiftDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const validDate = (value, todayStr) => {
  const s = asString(value);
  if (!YMD.test(s)) return null;
  // Rejects 2026-02-31: the Date round-trip normalises it to a different day.
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (x) => String(x).padStart(2, '0');
  if (`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` !== s) return null;
  if (s < shiftDays(todayStr, -PAST_DAYS) || s > shiftDays(todayStr, FUTURE_DAYS)) return null;
  return s;
};

const validTime = (value) => (HHMM.test(asString(value)) ? asString(value) : null);

const validRepeat = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.freq === 'monthly') {
    const monthDays = [...new Set(asArray(raw.monthDays).filter((n) => Number.isInteger(n) && n >= 1 && n <= 31))]
      .sort((a, b) => a - b);
    return monthDays.length ? { freq: 'monthly', monthDays } : null;
  }
  if (raw.freq === 'weekly') {
    const days = [...new Set(asArray(raw.days).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))]
      .sort((a, b) => a - b);
    return days.length ? { freq: 'weekly', days } : null;
  }
  return null;
};

// Comparison key for "did they mean this preset?": case-folded, punctuation-free words.
const words = (s) => asString(s).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);

// Dice coefficient over word sets. Cheap, order-insensitive, and good enough to tell
// "brush teeth" from "brush my teeth" without pulling in an edit-distance library.
const similarity = (a, b) => {
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (!A.size || !B.size) return 0;
  let shared = 0;
  A.forEach((w) => { if (B.has(w)) shared += 1; });
  return (2 * shared) / (A.size + B.size);
};

// Above this a preset is offered as a question on the card; it is never applied silently.
// Only a presetId the model returned — and that survived validation — counts as a match.
const SUGGEST_AT = 0.6;

export const bestPresetMatch = (name, presets) => {
  let best = null;
  let bestScore = 0;
  presets.forEach((p) => {
    const score = similarity(name, p.name);
    if (score > bestScore) { bestScore = score; best = p; }
  });
  return bestScore >= SUGGEST_AT ? best : null;
};

// `context` carries exactly what was sent to the model, so an id can only survive if it
// came from there: { todayStr, goals, presets, openTasks }.
export const guardProposal = (raw, context) => {
  const { todayStr } = context;
  const goalIds = new Set(context.goals.map((g) => g.id));
  const presetById = new Map(context.presets.map((p) => [p.id, p]));
  // Keyed on both parts because a repeating task shares one id across many days — the day
  // is what says which occurrence to tick off.
  const openByKey = new Map(context.openTasks.map((t) => [`${t.dateStr}|${t.id}`, t]));

  const tasks = asArray(raw && raw.tasks).map((t) => {
    const name = asString(t && t.name);
    if (!name) return null;

    const preset = presetById.get(asString(t && t.presetId)) || null;
    const repeat = validRepeat(t && t.repeat);
    // A repeating task has no single date; a one-off with an unusable date falls back to
    // today rather than being dropped — the day is visible and editable on the card.
    const date = repeat ? null : (validDate(t && t.date, todayStr) || todayStr);
    const goalId = goalIds.has(asString(t && t.goalId)) ? asString(t.goalId) : null;

    return {
      name,
      date,
      time: validTime(t && t.time) || (preset ? preset.time : null) || null,
      goalId: goalId || (preset ? preset.goalId : null) || null,
      carryOver: !!(t && t.carryOver),
      repeat,
      matchedPreset: preset,
      // Offered as "did you mean…?", not applied. Only when the model didn't already
      // match one, so a confident match is never second-guessed by a fuzzy one.
      suggestedPreset: preset ? null : bestPresetMatch(name, context.presets),
    };
  }).filter(Boolean);

  const groceries = asArray(raw && raw.groceries)
    .map((g) => asString(typeof g === 'string' ? g : g && g.name))
    .filter(Boolean);

  // A completion edits history, so it is the strictest check here: the exact day and id
  // must both be in the candidate list we sent, or it is discarded outright.
  const completions = asArray(raw && raw.completions).map((c) => {
    const hit = openByKey.get(`${asString(c && c.dateStr)}|${asString(c && c.taskId)}`);
    return hit ? { taskId: hit.id, dateStr: hit.dateStr, name: hit.name } : null;
  }).filter(Boolean);

  const unclear = asArray(raw && raw.unclear).map(asString).filter(Boolean);

  return { tasks, groceries, completions, unclear };
};

export const proposalCount = (p) => p.tasks.length + p.groceries.length + p.completions.length;
export const proposalIsEmpty = (p) => proposalCount(p) === 0 && p.unclear.length === 0;
