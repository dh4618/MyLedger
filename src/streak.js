// Consecutive days you did something. Pure: takes the days blob and today's date key.
//
// A day is *active* if you ticked anything at all that day — not if you finished
// everything. Doing one thing counts, which is the difference between a streak that
// encourages you to open the app and one that punishes you for a busy Tuesday.
//
// The rule is deliberately strict about what breaks it: a day with nothing ticked ends
// the streak whatever the reason, including a day with nothing scheduled. That keeps it
// something you can state in one sentence and can't argue with after the fact.

import { toDateStr, fromDateStr, addDays } from './dates.js';

// Values, not keys. Unticking writes `completed[id] = false` rather than deleting the
// entry, so a day where you ticked something and then changed your mind still has a
// populated map — and is not an active day.
export const isActiveDay = (day) => !!day && Object.values(day.completed || {}).some(Boolean);

const dayBefore = (ds) => toDateStr(addDays(fromDateStr(ds), -1));

/**
 * @returns { current, longest, includesToday }
 *   current       consecutive active days ending today, or ending yesterday if today
 *                 has nothing ticked yet
 *   longest       the best run ever recorded
 *   includesToday whether today is already counted — the UI needs this to tell
 *                 "you're on 3" from "you were on 3, today is still open"
 */
export function computeStreak(days, todayStr) {
  const active = new Set(Object.keys(days || {}).filter((ds) => isActiveDay(days[ds])));

  // An unfinished today is not a broken streak — the day isn't over. Counting from
  // yesterday means the number holds until midnight instead of resetting to zero every
  // morning and re-earning itself by lunchtime.
  const includesToday = active.has(todayStr);
  let cursor = includesToday ? todayStr : dayBefore(todayStr);
  let current = 0;
  while (active.has(cursor)) {
    current += 1;
    cursor = dayBefore(cursor);
  }

  // Longest run of *calendar-adjacent* active days. Sorting isn't enough on its own:
  // the blob only holds days you touched, so consecutive keys can be weeks apart.
  let longest = 0;
  let run = 0;
  let prev = null;
  [...active].sort().forEach((ds) => {
    run = prev && dayBefore(ds) === prev ? run + 1 : 1;
    prev = ds;
    if (run > longest) longest = run;
  });

  return { current, longest, includesToday };
}
