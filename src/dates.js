// Date arithmetic and formatting, with no knowledge of tasks, goals or storage.
//
// These lived at module scope in Ledger.jsx until the report screen needed the same
// arithmetic. They moved here rather than being exported from Ledger because report.js
// is pure and should not have to import the god component to ask what day it is.

const pad = (n) => String(n).padStart(2, '0');

// The app's date key everywhere: a local-time YYYY-MM-DD. Deliberately not an ISO
// timestamp — a task belongs to the day you are living in, not to a UTC instant, and
// toISOString() would move a late-evening task to tomorrow for anyone east of UTC.
export const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const fromDateStr = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (d, n) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

// Monday-first, matching the week strip on the day page.
export const startOfWeek = (d) => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
};

// Day 0 of the next month is the last day of this one.
export const daysInMonth = (dateStr) => new Date(Number(dateStr.slice(0, 4)), Number(dateStr.slice(5, 7)), 0).getDate();

// Every date string from `startStr` to `endStr` inclusive, ascending. Returns empty if
// the range runs backwards, which is what a period starting after today does — see the
// report's "counting stops at today" rule.
export const dateRange = (startStr, endStr) => {
  const out = [];
  if (!startStr || !endStr || startStr > endStr) return out;
  let cursor = fromDateStr(startStr);
  const end = fromDateStr(endStr);
  while (cursor <= end) {
    out.push(toDateStr(cursor));
    cursor = addDays(cursor, 1);
  }
  return out;
};

// Dates come from Intl rather than hand-written month and weekday arrays, so a new
// language needs no date work at all. Formatters are cached per locale because
// constructing one is comparatively expensive and these run on every render of the
// week strip and the calendar grid.
const formatterCache = new Map();
const formatter = (locale, options) => {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = formatterCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options);
    formatterCache.set(key, f);
  }
  return f;
};

// "Thursday, 30 July" / "7月30日 星期四" — en-GB puts the day first, which is what
// this app has always shown, and zh-CN produces its own natural order.
//
// Built from parts rather than format() because Intl's punctuation needs adjusting
// at both ends: en-GB renders a bare space after the weekday where this headline has
// always had a comma, and zh-CN butts the weekday straight onto the date with no gap
// at all ("7月30日星期四"), which reads cramped.
//
// The test for "needs a gap" is whether the text so far ends in whitespace — not
// whether Intl emitted a literal. In zh-CN the 日 *is* a literal, but it's content
// rather than a separator, so keying off the part type gets this exactly backwards.
export const formatHeadline = (date, locale) => {
  const parts = formatter(locale, { weekday: 'long', day: 'numeric', month: 'long' }).formatToParts(date);
  const endsOpen = (s) => s.length > 0 && !/\s$/.test(s);
  let out = '';
  parts.forEach((part, i) => {
    const prev = parts[i - 1];
    if (part.type === 'literal' && part.value === ' ' && prev && prev.type === 'weekday') {
      out += ', ';
      return;
    }
    // Separate the weekday from whatever it abuts, in either order.
    const abutsWeekday = part.type === 'weekday' || (prev && prev.type === 'weekday');
    if (abutsWeekday && endsOpen(out)) out += ' ';
    out += part.value;
  });
  return out;
};

// "Jul 30" / "7月30日"
export const formatShortDate = (date, locale) =>
  formatter(locale, { day: 'numeric', month: 'short' }).format(date);

// "July 2026" / "2026年7月"
export const formatMonthYear = (date, locale) =>
  formatter(locale, { year: 'numeric', month: 'long' }).format(date);
